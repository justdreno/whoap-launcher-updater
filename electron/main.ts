import { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, protocol, net } from 'electron';
import path from 'path';
import fs from 'fs';

// --- 0. Load .env manually for Main Process ---
function loadEnv() {
    const envPath = app.isPackaged
        ? path.join(process.resourcesPath, '.env')
        : path.join(__dirname, '../.env');

    if (fs.existsSync(envPath)) {
        try {
            const content = fs.readFileSync(envPath, 'utf8');
            content.split(/\r?\n/).forEach(line => {
                const [key, ...valueParts] = line.split('=');
                if (key && !key.startsWith('#') && valueParts.length > 0) {
                    const value = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
                    process.env[key.trim()] = value;
                }
            });
            console.log('[Main] Loaded .env file');
        } catch (e) {
            console.error('[Main] Failed to parse .env file:', e);
        }
    }
}

loadEnv();

// --- 0.25 Check for internet connectivity ---
async function isInternetConnected(): Promise<boolean> {
    try {
        const { net } = require('electron');
        const response = await net.fetch('https://api.github.com', { method: 'HEAD', mode: 'no-cors' });
        return response.ok || response.status === 0; // status 0 is cors-related but means network worked
    } catch (e) {
        return false;
    }
}

// Managers Import
import { AuthManager } from './managers/AuthManager';
import { InstanceManager } from './managers/InstanceManager';
import { VersionManager } from './launcher/VersionManager';
import { LaunchProcess } from './launcher/LaunchProcess';
import { ConfigManager } from './managers/ConfigManager';
import { LogWindowManager } from './managers/LogWindowManager';
import { CloudManager } from './managers/CloudManager';
import { ModpackManager } from './managers/ModpackManager';
import { ModsManager } from './managers/ModsManager';
import { SkinCacheManager } from './utils/SkinCacheManager';
import { NetworkManager } from './managers/NetworkManager';
import { DiscordManager } from './managers/DiscordManager';
import { ScreenshotManager } from './managers/ScreenshotManager';
import { ModPlatformManager } from './managers/ModPlatformManager';
import { ResourcePackManager } from './managers/ResourcePackManager';
import { ShaderPackManager } from './managers/ShaderPackManager';
import { ModMetadataManager } from './managers/ModMetadataManager';
import { backgroundSync } from './background-sync';

// Paths Configuration
process.env.DIST = path.join(__dirname, '../dist-react');
process.env.PUBLIC = app.isPackaged ? process.env.DIST! : path.join(process.env.DIST!, '../public');

// --- 0.5 Register Protocols as Privileged ---
protocol.registerSchemesAsPrivileged([
    { scheme: 'whoap-skin', privileges: { secure: true, standard: true, supportFetchAPI: true } },
    { scheme: 'whoap-cape', privileges: { secure: true, standard: true, supportFetchAPI: true } },
    { scheme: 'whoap-icon', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

let win: BrowserWindow | null = null;
let splash: BrowserWindow | null = null;
let tray: Tray | null = null;
let externalLinkWindow: BrowserWindow | null = null;

// Manager instances - stored at module level to prevent garbage collection
let authManager: AuthManager | null = null;
let instanceManager: InstanceManager | null = null;
let versionManager: VersionManager | null = null;
let launchProcess: LaunchProcess | null = null;
let logWindowManager: LogWindowManager | null = null;
let modpackManager: ModpackManager | null = null;
let modsManager: ModsManager | null = null;
let resourcePackManager: ResourcePackManager | null = null;
let shaderPackManager: ShaderPackManager | null = null;
let networkManager: NetworkManager | null = null;
let screenshotManager: ScreenshotManager | null = null;
let cloudManager: CloudManager | null = null;
let discordManager: DiscordManager | null = null;
let modPlatformManager: ModPlatformManager | null = null;
let modMetadataManager: ModMetadataManager | null = null;

// --- Helper: Get Icon Path ---
function getIconPath() {
    return app.isPackaged
        ? path.join(process.resourcesPath, 'icon.png')
        : path.join(__dirname, '../src/assets/logo.png');
}

// --- 1. Create Splash Screen ---
function createSplashWindow() {
    splash = new BrowserWindow({
        width: 340,
        height: 400,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        resizable: false,
        skipTaskbar: true,
        icon: getIconPath(),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'splash-preload.js')
        }
    });

    const splashUrl = VITE_DEV_SERVER_URL
        ? path.join(__dirname, '../public/splash.html')
        : path.join(process.env.DIST!, 'splash.html');

    splash.loadFile(splashUrl);
    console.log('[Main] Splash screen created');
}



// --- 2. Create Main Window ---
function createMainWindow() {
    win = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        show: false,
        frame: false,
        resizable: true,
        transparent: true,
        backgroundColor: '#00000000',
        icon: getIconPath(),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true
        }
    });

    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL);
    } else {
        win.loadFile(path.join(process.env.DIST!, 'index.html'));
    }

    win.once('ready-to-show', () => {
        setTimeout(() => {
            splash?.destroy();
            splash = null;
            win?.show();
            win?.focus();
        }, 1500);
    });

    win.on('maximize', () => win?.webContents.send('window:maximized-changed', true));
    win.on('unmaximize', () => win?.webContents.send('window:maximized-changed', false));
    win.on('closed', () => { win = null; });

    // Handle minimize - keep window stable and visible in taskbar
    win.on('minimize', () => {
        // Don't hide from taskbar, just minimize normally
        // This ensures the window thumbnail shows on hover
        if (process.platform === 'win32') {
            // On Windows, ensure the taskbar button stays visible
            win?.setSkipTaskbar(false);
        }
    });

    // Handle restore from minimize
    win.on('restore', () => {
        win?.focus();
        win?.show();
    });

    // Handle external links - open in branded window instead of default browser
    win.webContents.setWindowOpenHandler(({ url }) => {
        createExternalLinkWindow(url);
        return { action: 'deny' };
    });

    // Handle navigation to external URLs
    win.webContents.on('will-navigate', (event, url) => {
        const currentUrl = win?.webContents.getURL();
        // Only handle external URLs (not our app URLs)
        if (!url.startsWith('http://localhost') && !url.startsWith('file://') && !url.includes('vite')) {
            event.preventDefault();
            createExternalLinkWindow(url);
        }
    });
}

// --- 4. Tray Icon ---
function createTray() {
    const icon = nativeImage.createFromPath(getIconPath()).resize({ width: 16, height: 16 });
    tray = new Tray(icon);

    const updateTrayMenu = () => {
        const template: any[] = [
            {
                label: 'Show Launcher', click: () => {
                    if (win) {
                        if (win.isMinimized()) win.restore();
                        win.show();
                        win.focus();
                    }
                }
            },
            { type: 'separator' }
        ];

        // Add game status if running
        if (LaunchProcess.gameIsRunning) {
            template.push({
                label: 'Game is Running',
                enabled: false
            });
        }

        template.push(
            { type: 'separator' },
            { label: 'Quit', click: () => app.quit() }
        );

        const contextMenu = Menu.buildFromTemplate(template);
        tray?.setContextMenu(contextMenu);
    };

    tray.setToolTip('Whoap Launcher');
    updateTrayMenu();

    // Update menu periodically to reflect game status
    setInterval(updateTrayMenu, 5000);

    tray.on('click', () => {
        if (!win) return;
        if (win.isMinimized()) {
            win.restore();
        }
        win.isVisible() ? win.hide() : win.show();
    });

    tray.on('right-click', () => {
        updateTrayMenu();
        tray?.popUpContextMenu();
    });
}

// --- 4.5 External Link Window ---
function createExternalLinkWindow(url: string) {
    // If window already exists, just load the new URL in the wrapper
    if (externalLinkWindow && !externalLinkWindow.isDestroyed()) {
        const wrapperUrl = app.isPackaged
            ? `file://${path.join(process.resourcesPath, 'external-browser.html')}?url=${encodeURIComponent(url)}`
            : `file://${path.join(__dirname, '../public/external-browser.html')}?url=${encodeURIComponent(url)}`;
        externalLinkWindow.loadURL(wrapperUrl);
        externalLinkWindow.focus();
        return;
    }

    externalLinkWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 800,
        minHeight: 600,
        frame: false,
        resizable: true,
        transparent: false,
        backgroundColor: '#1a1a1a',
        icon: getIconPath(),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            webSecurity: true,
            webviewTag: true
        }
    });

    // Remove X-Frame-Options and Content-Security-Policy headers to allow embedding
    const filter = {
        urls: ['*://*/*']
    };

    externalLinkWindow.webContents.session.webRequest.onHeadersReceived(filter, (details, callback) => {
        const responseHeaders = details.responseHeaders || {};

        // Remove headers that prevent embedding
        delete responseHeaders['x-frame-options'];
        delete responseHeaders['X-Frame-Options'];
        delete responseHeaders['content-security-policy'];
        delete responseHeaders['Content-Security-Policy'];

        callback({
            cancel: false,
            responseHeaders
        });
    });

    // Load the wrapper HTML that includes the title bar and iframe
    const wrapperUrl = app.isPackaged
        ? `file://${path.join(process.resourcesPath, 'external-browser.html')}?url=${encodeURIComponent(url)}`
        : `file://${path.join(__dirname, '../public/external-browser.html')}?url=${encodeURIComponent(url)}`;

    externalLinkWindow.loadURL(wrapperUrl);

    externalLinkWindow.on('closed', () => {
        externalLinkWindow = null;
    });
}

// --- 5. App Lifecycle ---
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });

    app.whenReady().then(async () => {
        console.log("!!! ELECTRON MAIN STARTUP !!!");

        // Initialize ConfigManager first
        new ConfigManager();

        // Normal startup flow
        createSplashWindow();

        // Wait a moment for splash to render
        await new Promise(resolve => setTimeout(resolve, 1500));

        // Initialize all managers - store in module variables
        authManager = new AuthManager();
        instanceManager = InstanceManager.getInstance();
        versionManager = new VersionManager();
        launchProcess = new LaunchProcess();
        logWindowManager = new LogWindowManager();
        modpackManager = new ModpackManager();
        modsManager = new ModsManager();
        resourcePackManager = new ResourcePackManager();
        shaderPackManager = new ShaderPackManager();
        networkManager = new NetworkManager();
        screenshotManager = new ScreenshotManager();
        cloudManager = CloudManager.getInstance();
        discordManager = DiscordManager.getInstance();
        modPlatformManager = ModPlatformManager.getInstance();
        modMetadataManager = new ModMetadataManager();

        registerIpcHandlers();
        registerProtocolHandlers();

        // Initialize background sync
        backgroundSync.start();
        console.log('[Main] Background sync service started');

        createMainWindow();
        createTray();
    });
}

// --- Register Protocol Handlers ---
let protocolsRegistered = false;

function registerProtocolHandlers() {
    if (protocolsRegistered) {
        console.log('[Main] Protocol handlers already registered, skipping...');
        return;
    }

    console.log('[Main] Registering protocol handlers...');

    try {
        protocol.handle('whoap-skin', async (request: Request) => {
            console.log(`[Protocol] Request URL: ${request.url}`);
            let fileName = request.url.replace('whoap-skin://', '');
            fileName = fileName.split('?')[0];
            fileName = fileName.replace(/\/+$/, '');
            fileName = decodeURIComponent(fileName);

            // Check if this is a cached skin request
            if (fileName.startsWith('cached/')) {
                const parts = fileName.replace('cached/', '').split('/');
                if (parts.length >= 2) {
                    const username = parts[0];
                    const type = parts[1] as 'skin' | 'avatar';

                    // Try to get cached skin
                    const cachedPath = await SkinCacheManager.getCachedSkin(username, type);
                    if (cachedPath) {
                        console.log(`[Protocol] Serving cached ${type} for ${username}`);
                        return await net.fetch('file://' + cachedPath);
                    }

                    // No cache available - serve default skin
                    console.log(`[Protocol] No cache for ${username}, serving default`);
                    const defaultSkinPath = path.join(__dirname, '../assets/skins/steve.png');
                    if (fs.existsSync(defaultSkinPath)) {
                        return await net.fetch('file://' + defaultSkinPath);
                    }
                    return new Response(null, { status: 404 });
                }
            }

            const filePath = path.join(ConfigManager.getSkinsPath(), fileName);
            console.log(`[Protocol] Resolved Skin: "${fileName}" -> "${filePath}"`);
            try {
                if (!fs.existsSync(filePath)) {
                    console.warn(`[Protocol] Skin file NOT found at: ${filePath}`);
                    return new Response(null, { status: 404 });
                }
                return await net.fetch('file://' + filePath);
            } catch (e) {
                console.error('[Protocol] Error loading skin', e);
                return new Response(null, { status: 404 });
            }
        });

        protocol.handle('whoap-cape', async (request: Request) => {
            let fileName = request.url.replace('whoap-cape://', '');
            fileName = fileName.split('?')[0];
            if (fileName.endsWith('/')) fileName = fileName.slice(0, -1);
            fileName = decodeURIComponent(fileName);

            const filePath = path.join(ConfigManager.getCapesPath(), fileName);
            console.log(`[Protocol] Loading cape: ${fileName} -> "${filePath}"`);
            try {
                if (!fs.existsSync(filePath)) {
                    console.warn(`[Protocol] Cape file not found: ${filePath}`);
                    return new Response(null, { status: 404 });
                }
                return await net.fetch('file://' + filePath);
            } catch (e) {
                console.error('[Protocol] Failed to load cape', e);
                return new Response(null, { status: 404 });
            }
        });

        // Handler for instance icons
        protocol.handle('whoap-icon', async (request: Request) => {
            let filePath = '';
            try {
                const url = new URL(request.url);
                filePath = url.searchParams.get('path') || '';

                if (!filePath) {
                    filePath = request.url.replace(/^whoap-icon:\/\/*/, '');
                    filePath = filePath.split('?')[0];
                    filePath = decodeURIComponent(filePath);
                    // Handle legacy paths where drive colon was stripped
                    if (process.platform === 'win32' && /^[a-zA-Z]\//.test(filePath)) {
                        filePath = filePath.charAt(0) + ':' + filePath.slice(1);
                    }
                }
            } catch {
                filePath = request.url.replace(/^whoap-icon:\/\/*/, '');
                filePath = filePath.split('?')[0];
                filePath = decodeURIComponent(filePath);
            }

            console.log(`[Protocol] Loading icon: "${filePath}"`);
            try {
                if (!fs.existsSync(filePath)) {
                    console.warn(`[Protocol] Icon file not found: ${filePath}`);
                    return new Response(null, { status: 404 });
                }
                // Use proper file URL format for Windows (convert backslashes to forward slashes)
                const fileUrl = 'file://' + filePath.replace(/\\/g, '/');
                return await net.fetch(fileUrl);
            } catch (e) {
                console.error('[Protocol] Failed to load icon', e);
                return new Response(null, { status: 404 });
            }
        });

        protocolsRegistered = true;
        console.log('[Main] Protocol handlers registered successfully');
    } catch (error) {
        console.error('[Main] Failed to register protocol handlers:', error);
    }
}

app.on('window-all-closed', () => {
    // Stop background sync before quitting
    backgroundSync.stop();
    console.log('[Main] Background sync service stopped');
    if (process.platform !== 'darwin') app.quit();
});

// --- 6. IPC Handlers ---
function registerIpcHandlers() {
    // Window Controls
    ipcMain.on('window:minimize', () => win?.minimize());
    ipcMain.on('window:maximize', () => {
        if (!win) return;
        win.isMaximized() ? win.unmaximize() : win.maximize();
    });
    ipcMain.on('window:close', () => win?.close());

    // Legacy Support
    ipcMain.on('window-minimize', () => win?.minimize());
    ipcMain.on('window-maximize', () => {
        if (!win) return;
        win.isMaximized() ? win.unmaximize() : win.maximize();
    });
    ipcMain.on('window-close', () => win?.close());

    // App Reset
    ipcMain.handle('app:reset', async (_, mode: 'database' | 'full' = 'database') => {
        const userDataPath = ConfigManager.getDataPath();

        try {
            ['auth.json', 'config.json', 'favorites.json', 'whoap-config.json'].forEach(file => {
                const f = path.join(userDataPath, file);
                if (fs.existsSync(f)) fs.unlinkSync(f);
            });

            if (mode === 'full') {
                const instancesPath = path.join(userDataPath, 'instances');
                if (fs.existsSync(instancesPath)) fs.rmSync(instancesPath, { recursive: true, force: true });
            }

            app.relaunch();
            app.exit(0);
            return { success: true };
        } catch (e) {
            return { success: false, error: String(e) };
        }
    });

    ipcMain.on('log-to-terminal', (_, message) => {
        console.log(`[Renderer] ${message}`);
    });

    // Skin Import
    ipcMain.handle('skin:import', async (_, username?: string) => {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog({
            title: 'Import Skin',
            filters: [{ name: 'Skin Files', extensions: ['png'] }],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, canceled: true };
        }

        const srcPath = result.filePaths[0];
        const skinsDir = ConfigManager.getSkinsPath();

        if (!fs.existsSync(skinsDir)) {
            fs.mkdirSync(skinsDir, { recursive: true });
        }

        let fileName;
        if (username) {
            const safeName = username.replace(/[^a-zA-Z0-9_-]/g, '');
            const timestamp = Date.now().toString().slice(-6);
            fileName = `${safeName}_${timestamp}.png`;
        } else {
            fileName = path.basename(srcPath);
        }

        const destPath = path.join(skinsDir, fileName);

        try {
            fs.copyFileSync(srcPath, destPath);
            console.log(`[Skin] Imported skin: ${fileName}`);
            return { success: true, fileName, filePath: destPath };
        } catch (e) {
            console.error('[Skin] Failed to import skin:', e);
            return { success: false, error: String(e) };
        }
    });

    ipcMain.handle('skin:get-path', async () => {
        return ConfigManager.getSkinsPath();
    });

    // Skin Caching
    ipcMain.handle('skin:cache', async (_, username: string, type: 'skin' | 'avatar' = 'avatar') => {
        try {
            const result = await SkinCacheManager.cacheSkin(username, type);
            return { success: !!result, path: result };
        } catch (e) {
            console.error('[Skin] Failed to cache skin:', e);
            return { success: false, error: String(e) };
        }
    });

    ipcMain.handle('skin:get-cached', async (_, username: string, type: 'skin' | 'avatar' = 'avatar') => {
        try {
            const cached = await SkinCacheManager.getCachedSkin(username, type);
            return { success: !!cached, path: cached };
        } catch (e) {
            return { success: false, error: String(e) };
        }
    });

    ipcMain.handle('skin:refresh', async (_, username: string, type: 'skin' | 'avatar' = 'avatar') => {
        try {
            const result = await SkinCacheManager.refreshSkin(username, type);
            return { success: !!result, path: result };
        } catch (e) {
            console.error('[Skin] Failed to refresh skin:', e);
            return { success: false, error: String(e) };
        }
    });

    ipcMain.handle('skin:cache-status', async () => {
        try {
            const status = SkinCacheManager.getCacheStatus();
            return { success: true, status };
        } catch (e) {
            return { success: false, error: String(e) };
        }
    });

    ipcMain.handle('skin:clear-cache', async () => {
        try {
            await SkinCacheManager.clearCache();
            return { success: true };
        } catch (e) {
            return { success: false, error: String(e) };
        }
    });

    ipcMain.handle('skin:read-as-data-url', async (_, filePath: string) => {
        try {
            let fullPath = filePath;

            if (filePath.startsWith('file:')) {
                const skinsDir = ConfigManager.getSkinsPath();
                fullPath = path.join(skinsDir, filePath.replace('file:', ''));
            }

            if (!fs.existsSync(fullPath)) {
                return { success: false, error: 'File not found' };
            }

            const buffer = fs.readFileSync(fullPath);
            const base64 = buffer.toString('base64');
            const dataUrl = `data:image/png;base64,${base64}`;

            return { success: true, dataUrl };
        } catch (e) {
            console.error('[Skin] Failed to read file:', e);
            return { success: false, error: String(e) };
        }
    });

    ipcMain.handle('cape:read-as-data-url', async (_, filePath: string) => {
        try {
            let fullPath = filePath;

            if (filePath.startsWith('file:')) {
                const capesDir = ConfigManager.getCapesPath();
                fullPath = path.join(capesDir, filePath.replace('file:', ''));
            }

            if (!fs.existsSync(fullPath)) {
                return { success: false, error: 'File not found' };
            }

            const buffer = fs.readFileSync(fullPath);
            const base64 = buffer.toString('base64');
            const dataUrl = `data:image/png;base64,${base64}`;

            return { success: true, dataUrl };
        } catch (e) {
            console.error('[Cape] Failed to read file:', e);
            return { success: false, error: String(e) };
        }
    });

    // Background Sync Handlers
    ipcMain.handle('sync:status', async () => {
        return {
            success: true,
            status: backgroundSync.getStatus()
        };
    });

    ipcMain.handle('sync:trigger', async () => {
        try {
            await backgroundSync.syncNow();
            return { success: true };
        } catch (e) {
            return { success: false, error: String(e) };
        }
    });

    // Sync Queue Handlers
    ipcMain.handle('sync:execute-action', async (_, action) => {
        const cloudManager = CloudManager.getInstance();

        try {
            console.log(`[Sync] Executing action: ${action.type}`, action.payload);

            switch (action.type) {
                case 'instance:create':
                case 'instance:update': {
                    const { instance, userId, token } = action.payload;
                    const result = await cloudManager.syncInstance(instance, userId, token);
                    return { success: result.success, error: result.error };
                }

                case 'instance:delete': {
                    const { instanceName, userId } = action.payload;
                    const result = await cloudManager.deleteInstance(instanceName, userId);
                    return { success: result.success, error: result.error };
                }

                case 'friend:request': {
                    const { senderId, receiverId } = action.payload;
                    // Import CloudManager from renderer side
                    // For now, we'll need to implement this differently
                    return { success: true };
                }

                case 'friend:accept': {
                    const { requestId } = action.payload;
                    return { success: true };
                }

                case 'friend:remove': {
                    const { userId, friendId } = action.payload;
                    return { success: true };
                }

                default:
                    console.warn(`[Sync] Unknown action type: ${action.type}`);
                    return { success: false, error: 'Unknown action type' };
            }
        } catch (e) {
            console.error(`[Sync] Failed to execute action ${action.type}:`, e);
            return { success: false, error: String(e) };
        }
    });

    // Cape Import
    ipcMain.handle('cape:import', async () => {
        const { dialog } = require('electron');
        const result = await dialog.showOpenDialog({
            title: 'Import Cape',
            filters: [{ name: 'Cape Files', extensions: ['png'] }],
            properties: ['openFile']
        });

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, canceled: true };
        }

        const srcPath = result.filePaths[0];
        const capesDir = ConfigManager.getCapesPath();
        if (!fs.existsSync(capesDir)) fs.mkdirSync(capesDir, { recursive: true });

        const fileName = path.basename(srcPath);
        const destPath = path.join(capesDir, fileName);

        try {
            fs.copyFileSync(srcPath, destPath);
            return { success: true, fileName };
        } catch (e) {
            console.error('Failed to copy cape file', e);
            return { success: false, error: String(e) };
        }
    });

    ipcMain.handle('cape:get-path', () => {
        return ConfigManager.getCapesPath();
    });

    // Open external links in branded window
    ipcMain.handle('app:open-external', async (_, url: string) => {
        createExternalLinkWindow(url);
        return { success: true };
    });
}
