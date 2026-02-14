import { Client, Presence } from 'discord-rpc';
import { ipcMain, BrowserWindow } from 'electron';
import { ConfigManager } from './ConfigManager';

export interface PresenceData {
    state?: string;
    details?: string;
    largeImageKey?: string;
    largeImageText?: string;
    smallImageKey?: string;
    smallImageText?: string;
    startTimestamp?: number | Date;
    endTimestamp?: number | Date;
    instance?: boolean;
    partySize?: number;
    partyMax?: number;
    buttons?: { label: string; url: string }[];
}

export enum PresenceState {
    MENU = 'menu',
    LAUNCHING = 'launching',
    DOWNLOADING = 'downloading',
    PLAYING = 'playing',
    IDLE = 'idle'
}

export interface EnhancedPresenceData extends PresenceData {
    instanceId?: string;
    versionId?: string;
    loader?: string;
    isMultiplayer?: boolean;
    playerCount?: number;
    maxPlayers?: number;
    serverName?: string;
    presenceState?: PresenceState;
}

export class DiscordManager {
    private static instance: DiscordManager;
    private rpc: Client | null = null;
    private clientId: string = '1465139441457827972';
    private isReady: boolean = false;
    private currentPresence: EnhancedPresenceData | null = null;
    private reconnectInterval: NodeJS.Timeout | null = null;
    private isEnabled: boolean = true;
    private presenceStartTime: number = Date.now();
    private buttons: { label: string; url: string }[] = [];

    private loadButtons() {
        const downloadUrl = process.env.DISCORD_BUTTON_DOWNLOAD || 'https://whoap.net';
        const githubUrl = process.env.DISCORD_BUTTON_GITHUB || 'https://github.com/whoap';
        
        this.buttons = [
            { label: 'Download Launcher', url: downloadUrl },
            { label: 'View on GitHub', url: githubUrl }
        ];
    }

    // Version to image key mapping
    private versionImages: Record<string, string> = {
        '1.21': 'mc_1_21',
        '1.20': 'mc_1_20',
        '1.19': 'mc_1_19',
        '1.18': 'mc_1_18',
        '1.17': 'mc_1_17',
        '1.16': 'mc_1_16',
        '1.15': 'mc_1_15',
        '1.14': 'mc_1_14',
        '1.13': 'mc_1_13',
        '1.12': 'mc_1_12',
    };

    constructor() {
        this.loadButtons();
        this.loadSettings();
        this.init();
        this.registerIpc();
    }

    public static getInstance(): DiscordManager {
        if (!DiscordManager.instance) {
            DiscordManager.instance = new DiscordManager();
        }
        return DiscordManager.instance;
    }

    private loadSettings() {
        try {
            // Use electron-store directly for Discord settings
            const Store = require('electron-store');
            const store = new Store({ name: 'discord-settings' });
            this.isEnabled = store.get('enabled', true); // Default to true
        } catch {
            this.isEnabled = true;
        }
    }

    private saveSettings() {
        try {
            const Store = require('electron-store');
            const store = new Store({ name: 'discord-settings' });
            store.set('enabled', this.isEnabled);
        } catch (err) {
            console.error('[Discord] Failed to save settings:', err);
        }
    }

    private init() {
        if (!this.isEnabled) {
            console.log('[Discord] RPC is disabled');
            return;
        }

        this.attemptConnection();
        
        // Retry connection every 15 seconds if not ready
        this.reconnectInterval = setInterval(() => {
            if (!this.isReady && this.isEnabled) {
                this.attemptConnection();
            }
        }, 15000);
    }

    private async attemptConnection() {
        if (this.isReady || !this.isEnabled) return;

        try {
            // Re-instantiate client if it was destroyed or null
            if (!this.rpc) {
                this.rpc = new Client({ transport: 'ipc' });

                this.rpc.on('ready', () => {
                    console.log('[Discord] RPC Ready');
                    this.isReady = true;
                    this.setMenuPresence();
                });

                this.rpc.on('disconnected', () => {
                    console.log('[Discord] RPC Disconnected');
                    this.isReady = false;
                    this.rpc = null;
                });

                // Handle connection errors to prevent unhandled rejections
                this.rpc.on('error', (err: any) => {
                    if (err.message !== 'connection closed') {
                        console.warn('[Discord] RPC Error:', err.message);
                    }
                    this.isReady = false;
                    this.rpc = null;
                });
            }

            await this.rpc.login({ clientId: this.clientId }).catch((err: any) => {
                // Silently handle connection closed errors
                if (err.message !== 'connection closed') {
                    console.warn('[Discord] Login failed:', err.message);
                }
                throw err; // Re-throw to be caught by outer try-catch
            });
        } catch (err: any) {
            this.rpc = null;
            this.isReady = false;
            // Only log if it's not the common "connection closed" error
            if (err.message !== 'connection closed') {
                console.warn('[Discord] Connection attempt failed:', err.message);
            }
        }
    }

    private registerIpc() {
        ipcMain.handle('discord:update-presence', async (_: any, data: EnhancedPresenceData) => {
            return this.updatePresence(data);
        });

        ipcMain.handle('discord:clear-presence', async () => {
            this.clearPresence();
            return { success: true };
        });

        ipcMain.handle('discord:toggle', async (_: any, enabled: boolean) => {
            this.isEnabled = enabled;
            this.saveSettings();
            
            if (enabled) {
                if (!this.isReady) {
                    this.attemptConnection();
                } else {
                    this.setMenuPresence();
                }
            } else {
                this.clearPresence();
                if (this.rpc) {
                    this.rpc.destroy();
                    this.rpc = null;
                    this.isReady = false;
                }
            }
            
            return { success: true, enabled: this.isEnabled };
        });

        ipcMain.handle('discord:get-status', async () => {
            return {
                enabled: this.isEnabled,
                connected: this.isReady,
                currentState: this.currentPresence?.presenceState || 'none'
            };
        });
    }

    private getVersionImageKey(versionId: string): string {
        // Extract major.minor version
        const match = versionId.match(/^(\d+\.\d+)/);
        if (match) {
            const shortVersion = match[1];
            return this.versionImages[shortVersion] || 'logo';
        }
        return 'logo';
    }

    private getLoaderImageKey(loader?: string): string | undefined {
        const loaderImages: Record<string, string> = {
            'fabric': 'fabric',
            'forge': 'forge',
            'neoforge': 'neoforge',
            'quilt': 'quilt',
        };
        return loader ? loaderImages[loader.toLowerCase()] : undefined;
    }

    private formatInstanceName(instanceId: string): string {
        // Convert instance-id to Instance Id or use custom name if available
        return instanceId.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    }

    public setMenuPresence() {
        this.updatePresence({
            presenceState: PresenceState.MENU,
            details: 'Browsing Launcher',
            state: 'Ready to play',
            largeImageKey: 'logo',
            largeImageText: 'Whoap Launcher',
            smallImageKey: undefined,
            smallImageText: undefined,
            startTimestamp: this.presenceStartTime,
            buttons: this.buttons
        });
    }

    public setLaunchingPresence(instanceId: string, versionId: string) {
        this.updatePresence({
            presenceState: PresenceState.LAUNCHING,
            details: `Launching ${this.formatInstanceName(instanceId)}`,
            state: `Preparing ${versionId}...`,
            largeImageKey: this.getVersionImageKey(versionId),
            largeImageText: `Minecraft ${versionId}`,
            smallImageKey: 'logo',
            smallImageText: 'Whoap Launcher',
            startTimestamp: Date.now()
        });
    }

    public setDownloadingPresence(instanceId: string, progress?: number) {
        const progressText = progress ? ` (${progress.toFixed(0)}%)` : '';
        this.updatePresence({
            presenceState: PresenceState.DOWNLOADING,
            details: `Launching ${this.formatInstanceName(instanceId)}`,
            state: `Downloading files${progressText}...`,
            largeImageKey: 'download',
            largeImageText: 'Downloading',
            smallImageKey: 'logo',
            smallImageText: 'Whoap Launcher',
            startTimestamp: Date.now()
        });
    }

    public setPlayingPresence(instanceId: string, versionId: string, loader?: string, isMultiplayer?: boolean, serverName?: string) {
        const loaderKey = this.getLoaderImageKey(loader);
        
        let stateText = `Playing ${versionId}`;
        if (isMultiplayer && serverName) {
            stateText = `Multiplayer on ${serverName}`;
        } else if (isMultiplayer) {
            stateText = 'Playing Multiplayer';
        }

        this.updatePresence({
            presenceState: PresenceState.PLAYING,
            details: `Playing ${this.formatInstanceName(instanceId)}`,
            state: stateText,
            largeImageKey: this.getVersionImageKey(versionId),
            largeImageText: `Minecraft ${versionId}`,
            smallImageKey: loaderKey || 'logo',
            smallImageText: loader ? loader.charAt(0).toUpperCase() + loader.slice(1) : 'Whoap Launcher',
            startTimestamp: Date.now(),
            buttons: this.buttons
        });
    }

    public setIdlePresence() {
        this.updatePresence({
            presenceState: PresenceState.IDLE,
            details: 'Whoap Launcher',
            state: 'AFK',
            largeImageKey: 'logo',
            largeImageText: 'Whoap Launcher',
            startTimestamp: this.presenceStartTime,
            buttons: this.buttons
        });
    }

    public updatePresence(data: EnhancedPresenceData) {
        if (!this.isEnabled) return { success: false, error: 'Discord RPC is disabled' };
        if (!this.rpc || !this.isReady) return { success: false, error: 'Discord not connected' };

        try {
            this.currentPresence = data;

            const presence: Presence = {
                details: data.details,
                state: data.state,
                largeImageKey: data.largeImageKey || 'logo',
                largeImageText: data.largeImageText || 'Whoap Launcher',
                smallImageKey: data.smallImageKey,
                smallImageText: data.smallImageText,
                startTimestamp: data.startTimestamp,
                endTimestamp: data.endTimestamp,
                instance: false
            };

            // Add party info if playing multiplayer
            if (data.presenceState === PresenceState.PLAYING && data.isMultiplayer && data.playerCount && data.maxPlayers) {
                presence.partySize = data.playerCount;
                presence.partyMax = data.maxPlayers;
            }

            // Add buttons (Discord allows max 2)
            if (data.buttons && data.buttons.length > 0) {
                presence.buttons = data.buttons.slice(0, 2);
            }

            this.rpc.setActivity(presence).catch((err: any) => {
                // Silently handle connection errors during activity update
                if (err.message !== 'connection closed') {
                    console.warn('[Discord] Failed to update activity:', err.message);
                }
            });
            return { success: true };
        } catch (err: any) {
            // Handle synchronous errors
            if (err.message !== 'connection closed') {
                console.error('[Discord] Failed to set activity:', err);
            }
            return { success: false, error: err.message };
        }
    }

    public clearPresence() {
        if (this.rpc && this.isReady) {
            try {
                this.rpc.clearActivity().catch((err: any) => {
                    if (err.message !== 'connection closed') {
                        console.warn('[Discord] Failed to clear activity:', err.message);
                    }
                });
                this.currentPresence = null;
            } catch (err: any) {
                if (err.message !== 'connection closed') {
                    console.error('[Discord] Failed to clear activity:', err);
                }
            }
        }
    }

    public disconnect() {
        if (this.reconnectInterval) {
            clearInterval(this.reconnectInterval);
            this.reconnectInterval = null;
        }
        
        if (this.rpc) {
            try {
                this.rpc.destroy().catch((err: any) => {
                    // Silently ignore destroy errors
                });
            } catch (err) {
                // Silently ignore errors
            }
            this.rpc = null;
            this.isReady = false;
        }
    }

    public isConnected(): boolean {
        return this.isReady;
    }

    public getStatus() {
        return {
            enabled: this.isEnabled,
            connected: this.isReady,
            currentState: this.currentPresence?.state || 'none'
        };
    }
}
