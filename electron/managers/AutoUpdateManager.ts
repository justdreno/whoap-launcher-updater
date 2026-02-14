import { autoUpdater, UpdateInfo } from 'electron-updater';
import { BrowserWindow, ipcMain, dialog } from 'electron';
import { ConfigManager } from './ConfigManager';

export interface UpdateSettings {
    autoCheck: boolean;
    autoDownload: boolean;
    checkInterval: number; // in hours
}

export class AutoUpdateManager {
    private static instance: AutoUpdateManager;
    private mainWindow: BrowserWindow | null = null;
    private settings: UpdateSettings = {
        autoCheck: true,
        autoDownload: false,
        checkInterval: 24 // Check every 24 hours
    };
    private checkIntervalId: NodeJS.Timeout | null = null;
    private lastCheckTime: number = 0;

    private constructor() {
        this.loadSettings();
        this.configureUpdater();
        this.setupListeners();
    }

    public static getInstance(): AutoUpdateManager {
        if (!AutoUpdateManager.instance) {
            AutoUpdateManager.instance = new AutoUpdateManager();
        }
        return AutoUpdateManager.instance;
    }

    private loadSettings() {
        try {
            const store = require('electron-store');
            const configStore = new store({ name: 'update-settings' });
            this.settings = {
                autoCheck: configStore.get('autoCheck', true),
                autoDownload: configStore.get('autoDownload', false),
                checkInterval: configStore.get('checkInterval', 24)
            };
        } catch (err) {
            console.error('[AutoUpdater] Failed to load settings:', err);
        }
    }

    private saveSettings() {
        try {
            const store = require('electron-store');
            const configStore = new store({ name: 'update-settings' });
            configStore.set('autoCheck', this.settings.autoCheck);
            configStore.set('autoDownload', this.settings.autoDownload);
            configStore.set('checkInterval', this.settings.checkInterval);
        } catch (err) {
            console.error('[AutoUpdater] Failed to save settings:', err);
        }
    }

    private configureUpdater() {
        // Configure auto-updater
        autoUpdater.autoDownload = this.settings.autoDownload;
        autoUpdater.autoInstallOnAppQuit = true;
        
        // Set logger
        autoUpdater.logger = console;
    }

    private setupListeners() {
        autoUpdater.on('checking-for-update', () => {
            console.log('[AutoUpdater] Checking for updates...');
            this.lastCheckTime = Date.now();
            this.sendToRenderer('update:checking');
        });

        autoUpdater.on('update-available', (info: UpdateInfo) => {
            console.log('[AutoUpdater] Update available:', info.version);
            this.sendToRenderer('update:available', {
                version: info.version,
                releaseDate: info.releaseDate,
                releaseNotes: info.releaseNotes,
                currentVersion: autoUpdater.currentVersion
            });

            // Show native notification if window is not focused
            if (this.mainWindow && !this.mainWindow.isFocused()) {
                this.showUpdateNotification(info.version);
            }
        });

        autoUpdater.on('update-not-available', () => {
            console.log('[AutoUpdater] No updates available.');
            this.sendToRenderer('update:not-available');
        });

        autoUpdater.on('download-progress', (progress) => {
            console.log(`[AutoUpdater] Download progress: ${progress.percent.toFixed(1)}%`);
            this.sendToRenderer('update:progress', {
                percent: progress.percent,
                bytesPerSecond: progress.bytesPerSecond,
                transferred: progress.transferred,
                total: progress.total
            });
        });

        autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
            console.log('[AutoUpdater] Update downloaded:', info.version);
            this.sendToRenderer('update:downloaded', { version: info.version });

            // Show dialog asking to install now or later
            this.showInstallDialog(info.version);
        });

        autoUpdater.on('error', (err) => {
            console.error('[AutoUpdater] Error:', err.message);
            this.sendToRenderer('update:error', { 
                message: err.message,
                code: err.stack
            });
        });

        // IPC Handlers
        ipcMain.handle('update:check', async () => {
            try {
                const result = await autoUpdater.checkForUpdates();
                return { 
                    success: true, 
                    updateInfo: result?.updateInfo,
                    currentVersion: autoUpdater.currentVersion
                };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('update:download', async () => {
            try {
                await autoUpdater.downloadUpdate();
                return { success: true };
            } catch (err: any) {
                return { success: false, error: err.message };
            }
        });

        ipcMain.handle('update:install', () => {
            autoUpdater.quitAndInstall(false, true);
        });

        ipcMain.handle('update:get-settings', () => {
            return {
                success: true,
                settings: this.settings,
                lastCheckTime: this.lastCheckTime
            };
        });

        ipcMain.handle('update:set-settings', (_, newSettings: Partial<UpdateSettings>) => {
            this.settings = { ...this.settings, ...newSettings };
            this.saveSettings();
            
            // Apply settings
            autoUpdater.autoDownload = this.settings.autoDownload;
            
            // Restart auto-check interval if changed
            if (this.settings.autoCheck) {
                this.startAutoCheck();
            } else {
                this.stopAutoCheck();
            }
            
            return { success: true, settings: this.settings };
        });

        ipcMain.handle('update:get-version', () => {
            return {
                success: true,
                version: autoUpdater.currentVersion
            };
        });
    }

    private showUpdateNotification(version: string) {
        // You can integrate with a notification system here
        console.log(`[AutoUpdater] Update ${version} available notification`);
    }

    private async showInstallDialog(version: string) {
        if (!this.mainWindow) return;

        const result = await dialog.showMessageBox(this.mainWindow, {
            type: 'info',
            title: 'Update Ready',
            message: `Whoap Launcher ${version} has been downloaded.`,
            detail: 'The update will be installed when you restart the application. Would you like to install it now?',
            buttons: ['Install Now', 'Later'],
            defaultId: 0,
            cancelId: 1
        });

        if (result.response === 0) {
            autoUpdater.quitAndInstall(false, true);
        }
    }

    private sendToRenderer(channel: string, data?: any) {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            this.mainWindow.webContents.send(channel, data);
        }
    }

    private startAutoCheck() {
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
        }

        // Convert hours to milliseconds
        const intervalMs = this.settings.checkInterval * 60 * 60 * 1000;
        
        this.checkIntervalId = setInterval(() => {
            if (this.settings.autoCheck) {
                this.checkForUpdates();
            }
        }, intervalMs);

        console.log(`[AutoUpdater] Auto-check enabled every ${this.settings.checkInterval} hours`);
    }

    private stopAutoCheck() {
        if (this.checkIntervalId) {
            clearInterval(this.checkIntervalId);
            this.checkIntervalId = null;
        }
        console.log('[AutoUpdater] Auto-check disabled');
    }

    public setMainWindow(window: BrowserWindow) {
        this.mainWindow = window;
    }

    public async checkForUpdatesOnStartup() {
        if (!this.settings.autoCheck) {
            console.log('[AutoUpdater] Auto-check disabled, skipping startup check');
            return;
        }

        // Wait a bit before checking to let app fully load
        setTimeout(async () => {
            try {
                console.log('[AutoUpdater] Running startup check...');
                await this.checkForUpdates();
            } catch (err) {
                console.error('[AutoUpdater] Startup check failed:', err);
            }
        }, 5000);
    }

    public async checkForUpdates(): Promise<{ success: boolean; updateAvailable?: boolean; error?: string }> {
        try {
            // Only check if running in production (packaged)
            if (process.env.NODE_ENV === 'development' || !require('electron').app.isPackaged) {
                console.log('[AutoUpdater] Skipping update check in development mode');
                return { success: true, updateAvailable: false };
            }

            const result = await autoUpdater.checkForUpdates();
            return { 
                success: true, 
                updateAvailable: result?.updateInfo?.version !== autoUpdater.currentVersion
            };
        } catch (err: any) {
            console.error('[AutoUpdater] Check failed:', err);
            return { success: false, error: err.message };
        }
    }

    public async downloadUpdate(): Promise<{ success: boolean; error?: string }> {
        try {
            await autoUpdater.downloadUpdate();
            return { success: true };
        } catch (err: any) {
            return { success: false, error: err.message };
        }
    }

    public installUpdate() {
        autoUpdater.quitAndInstall(false, true);
    }

    public getSettings(): UpdateSettings {
        return this.settings;
    }

    public getLastCheckTime(): number {
        return this.lastCheckTime;
    }

    public getCurrentVersion(): string {
        return autoUpdater.currentVersion;
    }
}
