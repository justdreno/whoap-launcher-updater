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
import { NetworkManager } from './managers/NetworkManager';
import { AutoUpdateManager } from './managers/AutoUpdateManager';
import { DiscordManager } from './managers/DiscordManager';
import { ScreenshotManager } from './managers/ScreenshotManager';
import { ModPlatformManager } from './managers/ModPlatformManager';
import { ResourcePackManager } from './managers/ResourcePackManager';
import { ShaderPackManager } from './managers/ShaderPackManager';
import { ModMetadataManager } from './managers/ModMetadataManager';

// Paths Configuration
process.env.DIST = path.join(__dirname, '../dist-react');
process.env.PUBLIC = app.isPackaged ? process.env.DIST! : path.join(process.env.DIST!, '../public');

// --- 0.5 Register Protocols as Privileged ---
protocol.registerSchemesAsPrivileged([
    { scheme: 'whoap-skin', privileges: { secure: true, standard: true, supportFetchAPI: true } },
    { scheme: 'whoap-cape', privileges: { secure: true, standard: true, supportFetchAPI: true } }
]);

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

let win: BrowserWindow | null = null;
let splash: BrowserWindow | null = null;
let onboardingWin: BrowserWindow | null = null;
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
            contextIsolation: true
        }
    });

    const splashUrl = VITE_DEV_SERVER_URL
        ? path.join(__dirname, '../public/splash.html')
        : path.join(process.env.DIST!, 'splash.html');

    splash.loadFile(splashUrl);
    console.log('[Main] Splash screen created');
}

// --- 2. Create Onboarding Window ---
function createOnboardingWindow() {
    onboardingWin = new BrowserWindow({
        width: 900,
        height: 650,
        minWidth: 800,
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
        onboardingWin.loadURL(VITE_DEV_SERVER_URL + '#/onboarding');
    } else {
        onboardingWin.loadFile(path.join(process.env.DIST!, 'index.html'), {
            hash: 'onboarding'
        });
    }

    onboardingWin.once('ready-to-show', () => {
        splash?.destroy();
        splash = null;
        onboardingWin?.show();
        onboardingWin?.focus();
    });

    onboardingWin.on('closed', () => {
        onboardingWin = null;
    });

    // Window controls for onboarding
    ipcMain.on('onboarding:minimize', () => onboardingWin?.minimize());
    ipcMain.on('onboarding:close', () => {
        onboardingWin?.close();
        app.quit();
    });

    // Handle onboarding completion
    ipcMain.handle('onboarding:complete', async (_, dataPath?: string) => {
        try {
            const result = await ConfigManager.completeOnboarding(dataPath);
            
            if (result.success) {
                console.log('[Main] Initializing managers after onboarding...');
                
                // Initialize all managers after onboarding - store in module variables
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
                
                // Register app-level IPC handlers
                registerIpcHandlers();
                
                // Register protocol handlers for skins/capes
                registerProtocolHandlers();

                console.log('[Main] All managers initialized, creating main window...');

                // Close onboarding and create main window
                onboardingWin?.close();
                onboardingWin = null;
                
                createMainWindow();
                createTray();
                
                // Initialize auto-updater
                AutoUpdateManager.getInstance().setMainWindow(win!);
                AutoUpdateManager.getInstance().checkForUpdatesOnStartup();
                
                return { success: true };
            }
            return result;
        } catch (error) {
            console.error('[Main] Onboarding completion failed:', error);
            return { success: false, error: String(error) };
        }
    });
}

// --- 3. Create Main Window ---
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

            AutoUpdateManager.getInstance().setMainWindow(win!);
            AutoUpdateManager.getInstance().checkForUpdatesOnStartup();
        }, 1500);
    });

    win.on('maximize', () => win?.webContents.send('window:maximized-changed', true));
    win.on('unmaximize', () => win?.webContents.send('window:maximized-changed', false));
    win.on('closed', () => { win = null; });

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

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show Launcher', click: () => win?.show() },
        { label: 'Quit', click: () => app.quit() }
    ]);

    tray.setToolTip('Whoap Launcher');
    tray.setContextMenu(contextMenu);
    tray.on('click', () => {
        if (!win) return;
        win.isVisible() ? win.hide() : win.show();
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

        // Initialize ConfigManager first (handles first-launch detection)
        new ConfigManager();

        // Check if this is first launch
        const isFirstLaunch = !ConfigManager.isOnboardingCompleted();
        console.log(`[Main] First launch: ${isFirstLaunch}`);

        if (isFirstLaunch) {
            // Show onboarding flow
            createSplashWindow();
            createOnboardingWindow();
        } else {
            // Normal startup flow
            createSplashWindow();

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

            createMainWindow();
            createTray();
        }
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
        
        protocolsRegistered = true;
        console.log('[Main] Protocol handlers registered successfully');
    } catch (error) {
        console.error('[Main] Failed to register protocol handlers:', error);
    }
}

app.on('window-all-closed', () => {
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
