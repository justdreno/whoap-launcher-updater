import Store from 'electron-store';
import { app, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { VersionUtils } from '../utils/VersionUtils';

interface JavaPaths {
    [version: string]: string;
}

interface ProxyConfig {
    enabled: boolean;
    host: string;
    port: number;
    type: 'http' | 'socks';
    username?: string;
    password?: string;
}

interface AppConfig {
    dataPath: string;
    gamePath: string;
    instancesPath: string;
    skinsPath: string;
    capesPath: string;
    runtimesPath: string;
    minRam: number;
    maxRam: number;
    javaPaths: JavaPaths;
    launchBehavior: 'hide' | 'minimize' | 'keep';
    showConsoleOnLaunch: boolean;
    jvmPreset: 'potato' | 'standard' | 'pro' | 'extreme' | 'custom';
    jvmArgs: string[];
    proxy: ProxyConfig;
    onboardingCompleted: boolean;
    firstLaunchDate: string | null;
}

// App-level store (small, in app directory) - stores just the data path location
interface AppLevelConfig {
    dataPath: string | null;
    onboardingCompleted: boolean;
    firstLaunchDate: string | null;
}

const appLevelStore = new Store<AppLevelConfig>({
    name: 'whoap-app-config',
    defaults: {
        dataPath: null,
        onboardingCompleted: false,
        firstLaunchDate: null
    }
});

// Main config store - this will be initialized after we know the data path
let userConfigStore: Store<AppConfig> | null = null;

function getDefaultDataPath(): string {
    // Default to %USERPROFILE%/.whoap (hidden folder)
    const homeDir = app.getPath('home');
    return path.join(homeDir, '.whoap');
}

function getUserConfigStore(): Store<AppConfig> {
    if (!userConfigStore) {
        const dataPath = ConfigManager.getDataPath();
        
        // Ensure the directory exists
        if (!fs.existsSync(dataPath)) {
            fs.mkdirSync(dataPath, { recursive: true });
        }

        userConfigStore = new Store<AppConfig>({
            name: 'whoap-config',
            cwd: dataPath,
            defaults: {
                dataPath: dataPath,
                gamePath: path.join(dataPath, 'gamedata'),
                instancesPath: path.join(dataPath, 'instances'),
                skinsPath: path.join(dataPath, 'skins'),
                capesPath: path.join(dataPath, 'capes'),
                runtimesPath: path.join(dataPath, 'runtimes'),
                minRam: 1024,
                maxRam: 4096,
                javaPaths: {},
                launchBehavior: 'hide',
                showConsoleOnLaunch: true,
                jvmPreset: 'standard',
                jvmArgs: [],
                proxy: {
                    enabled: false,
                    host: '127.0.0.1',
                    port: 8080,
                    type: 'http'
                },
                onboardingCompleted: false,
                firstLaunchDate: null
            }
        });
    }
    return userConfigStore;
}

export class ConfigManager {
    private static isInitialized = false;

    constructor() {
        if (!ConfigManager.isInitialized) {
            this.initializeFirstLaunch();
            this.registerListeners();
            ConfigManager.isInitialized = true;
        }
    }

    private initializeFirstLaunch() {
        // Check if this is first launch
        const firstLaunchDate = appLevelStore.get('firstLaunchDate');
        if (!firstLaunchDate) {
            appLevelStore.set('firstLaunchDate', new Date().toISOString());
            console.log('[ConfigManager] First launch detected');
        }
    }

    private registerListeners() {
        // Check if onboarding is needed
        ipcMain.handle('config:is-first-launch', () => {
            return {
                isFirstLaunch: !appLevelStore.get('onboardingCompleted'),
                defaultPath: getDefaultDataPath()
            };
        });

        // Complete onboarding with selected path
        ipcMain.handle('config:complete-onboarding', async (_, dataPath?: string) => {
            return await ConfigManager.completeOnboarding(dataPath);
        });

        // Get all config
        ipcMain.handle('config:get', () => {
            return getUserConfigStore().store;
        });

        // Set any config key
        ipcMain.handle('config:set', (_, key: keyof AppConfig, value: any) => {
            getUserConfigStore().set(key, value);
            return { success: true, value };
        });

        // Dialog to select data path (for onboarding or settings)
        ipcMain.handle('config:select-data-path', async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory', 'createDirectory'],
                title: 'Select Whoap Data Folder',
                defaultPath: ConfigManager.getDataPath(),
                message: 'Choose where Whoap will store game data, instances, and settings'
            });

            if (!result.canceled && result.filePaths.length > 0) {
                const newPath = result.filePaths[0];
                return { success: true, path: newPath };
            }
            return { success: false, canceled: true };
        });

        // Change data path (requires restart)
        ipcMain.handle('config:change-data-path', async (_, newPath: string) => {
            try {
                if (!fs.existsSync(newPath)) {
                    fs.mkdirSync(newPath, { recursive: true });
                }

                // Create subdirectories
                const subdirs = ['gamedata', 'instances', 'skins', 'capes', 'runtimes', 'logs'];
                for (const dir of subdirs) {
                    const dirPath = path.join(newPath, dir);
                    if (!fs.existsSync(dirPath)) {
                        fs.mkdirSync(dirPath, { recursive: true });
                    }
                }

                appLevelStore.set('dataPath', newPath);
                
                // Update user config
                const store = getUserConfigStore();
                store.set('dataPath', newPath);
                store.set('gamePath', path.join(newPath, 'gamedata'));
                store.set('instancesPath', path.join(newPath, 'instances'));
                store.set('skinsPath', path.join(newPath, 'skins'));
                store.set('capesPath', path.join(newPath, 'capes'));
                store.set('runtimesPath', path.join(newPath, 'runtimes'));

                return { success: true, path: newPath };
            } catch (error) {
                return { success: false, error: String(error) };
            }
        });

        // Reset to default path
        ipcMain.handle('config:reset-data-path', async () => {
            try {
                const defaultPath = getDefaultDataPath();
                appLevelStore.set('dataPath', defaultPath);
                
                const store = getUserConfigStore();
                store.set('dataPath', defaultPath);
                store.set('gamePath', path.join(defaultPath, 'gamedata'));
                store.set('instancesPath', path.join(defaultPath, 'instances'));
                store.set('skinsPath', path.join(defaultPath, 'skins'));
                store.set('capesPath', path.join(defaultPath, 'capes'));
                store.set('runtimesPath', path.join(defaultPath, 'runtimes'));

                return { success: true, path: defaultPath };
            } catch (error) {
                return { success: false, error: String(error) };
            }
        });

        // Dialog to select game path
        ipcMain.handle('config:set-game-path', async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: 'Select Game Data Folder'
            });

            if (!result.canceled && result.filePaths.length > 0) {
                const newPath = result.filePaths[0];
                getUserConfigStore().set('gamePath', newPath);
                return { success: true, path: newPath };
            }
            return { success: false };
        });

        // Dialog to select instances path
        ipcMain.handle('config:set-instances-path', async () => {
            const result = await dialog.showOpenDialog({
                properties: ['openDirectory'],
                title: 'Select Instances Folder'
            });

            if (!result.canceled && result.filePaths.length > 0) {
                const newPath = result.filePaths[0];
                getUserConfigStore().set('instancesPath', newPath);
                return { success: true, path: newPath };
            }
            return { success: false };
        });

        // Set Java path for a specific version
        ipcMain.handle('config:set-java', (_, version: string, javaPath: string) => {
            const javaPaths = getUserConfigStore().get('javaPaths') || {};
            javaPaths[version] = javaPath;
            getUserConfigStore().set('javaPaths', javaPaths);
            return { success: true, version, path: javaPath };
        });

        // Reset Java for a specific version to auto
        ipcMain.handle('config:reset-java', (_, version?: string) => {
            const javaPaths = getUserConfigStore().get('javaPaths') || {};
            if (version) {
                delete javaPaths[version];
            } else {
                Object.keys(javaPaths).forEach(key => delete javaPaths[key]);
            }
            getUserConfigStore().set('javaPaths', javaPaths);
            return { success: true };
        });

        // Get all Java paths
        ipcMain.handle('config:get-java-paths', () => {
            return getUserConfigStore().get('javaPaths') || {};
        });

        // Get current data path info
        ipcMain.handle('config:get-data-path-info', () => {
            return {
                dataPath: ConfigManager.getDataPath(),
                gamePath: ConfigManager.getGamePath(),
                instancesPath: ConfigManager.getInstancesPath(),
                skinsPath: ConfigManager.getSkinsPath(),
                capesPath: ConfigManager.getCapesPath(),
                runtimesPath: ConfigManager.getRuntimesPath(),
                isDefault: ConfigManager.getDataPath() === getDefaultDataPath()
            };
        });

        // Scan versions from game path
        ipcMain.handle('config:scan-versions', async (event) => {
            const gamePath = ConfigManager.getGamePath();
            const versionsPath = path.join(gamePath, 'versions');
            const results: Array<{ id: string; name: string; version: string; loader: string }> = [];

            if (!fs.existsSync(versionsPath)) {
                return { success: false, error: 'Versions folder not found', versions: [] };
            }

            try {
                const folders = fs.readdirSync(versionsPath);
                const total = folders.length;
                let scanned = 0;

                for (const folder of folders) {
                    const jsonPath = path.join(versionsPath, folder, `${folder}.json`);

                    if (fs.existsSync(jsonPath)) {
                        const info = VersionUtils.getInfo(jsonPath, folder);
                        results.push({
                            id: folder,
                            name: info.name,
                            version: info.mcVersion,
                            loader: info.loader
                        });
                    }

                    scanned++;
                    if (event.sender) {
                        event.sender.send('config:scan-progress', {
                            progress: scanned,
                            total: total,
                            current: folder
                        });
                    }
                }

                return { success: true, versions: results };
            } catch (e) {
                console.error('Version scan error:', e);
                return { success: false, error: String(e), versions: [] };
            }
        });

        // Get storage usage info
        ipcMain.handle('config:get-storage-info', async () => {
            try {
                const dataPath = ConfigManager.getDataPath();
                
                async function getFolderSize(folderPath: string): Promise<number> {
                    if (!fs.existsSync(folderPath)) return 0;
                    
                    let size = 0;
                    const files = fs.readdirSync(folderPath);
                    
                    for (const file of files) {
                        const filePath = path.join(folderPath, file);
                        const stats = fs.statSync(filePath);
                        
                        if (stats.isDirectory()) {
                            size += await getFolderSize(filePath);
                        } else {
                            size += stats.size;
                        }
                    }
                    
                    return size;
                }

                const [totalSize, instancesSize, gameDataSize, skinsSize, capesSize] = await Promise.all([
                    getFolderSize(dataPath),
                    getFolderSize(ConfigManager.getInstancesPath()),
                    getFolderSize(ConfigManager.getGamePath()),
                    getFolderSize(ConfigManager.getSkinsPath()),
                    getFolderSize(ConfigManager.getCapesPath())
                ]);

                return {
                    success: true,
                    dataPath,
                    sizes: {
                        total: totalSize,
                        instances: instancesSize,
                        gameData: gameDataSize,
                        skins: skinsSize,
                        capes: capesSize
                    }
                };
            } catch (error) {
                return { success: false, error: String(error) };
            }
        });
    }

    // Static getters
    static getDataPath(): string {
        const customPath = appLevelStore.get('dataPath');
        return customPath || getDefaultDataPath();
    }

    static getGamePath(): string {
        try {
            return getUserConfigStore().get('gamePath');
        } catch {
            return path.join(ConfigManager.getDataPath(), 'gamedata');
        }
    }

    static getInstancesPath(): string {
        try {
            return getUserConfigStore().get('instancesPath');
        } catch {
            return path.join(ConfigManager.getDataPath(), 'instances');
        }
    }

    static getSkinsPath(): string {
        try {
            return getUserConfigStore().get('skinsPath');
        } catch {
            return path.join(ConfigManager.getDataPath(), 'skins');
        }
    }

    static getCapesPath(): string {
        try {
            return getUserConfigStore().get('capesPath');
        } catch {
            return path.join(ConfigManager.getDataPath(), 'capes');
        }
    }

    static getRuntimesPath(): string {
        try {
            return getUserConfigStore().get('runtimesPath');
        } catch {
            return path.join(ConfigManager.getDataPath(), 'runtimes');
        }
    }

    static getMinRam(): number {
        try {
            return getUserConfigStore().get('minRam');
        } catch {
            return 1024;
        }
    }

    static getMaxRam(): number {
        try {
            return getUserConfigStore().get('maxRam');
        } catch {
            return 4096;
        }
    }

    static getJavaPath(version?: string): string {
        try {
            const javaPaths = getUserConfigStore().get('javaPaths') || {};
            if (version && javaPaths[version]) {
                return javaPaths[version];
            }
        } catch {}
        return 'auto';
    }

    static getJavaPaths(): JavaPaths {
        try {
            return getUserConfigStore().get('javaPaths') || {};
        } catch {
            return {};
        }
    }

    static getLaunchBehavior(): string {
        try {
            return getUserConfigStore().get('launchBehavior');
        } catch {
            return 'hide';
        }
    }

    static getShowConsoleOnLaunch(): boolean {
        try {
            return getUserConfigStore().get('showConsoleOnLaunch');
        } catch {
            return true;
        }
    }

    static getJvmPreset(): string {
        try {
            return getUserConfigStore().get('jvmPreset') || 'standard';
        } catch {
            return 'standard';
        }
    }

    static getJvmArgs(): string[] {
        try {
            return getUserConfigStore().get('jvmArgs') || [];
        } catch {
            return [];
        }
    }

    static getProxy(): ProxyConfig {
        try {
            return getUserConfigStore().get('proxy') || { enabled: false, host: '127.0.0.1', port: 8080, type: 'http' };
        } catch {
            return { enabled: false, host: '127.0.0.1', port: 8080, type: 'http' };
        }
    }

    static isOnboardingCompleted(): boolean {
        return appLevelStore.get('onboardingCompleted');
    }

    static getFirstLaunchDate(): string | null {
        return appLevelStore.get('firstLaunchDate');
    }

    static async completeOnboarding(dataPath?: string): Promise<{ success: boolean; path?: string; message?: string; error?: string }> {
        try {
            const selectedPath = dataPath || getDefaultDataPath();
            
            // Create the directory structure
            if (!fs.existsSync(selectedPath)) {
                fs.mkdirSync(selectedPath, { recursive: true });
            }

            // Create subdirectories
            const subdirs = ['gamedata', 'instances', 'skins', 'capes', 'runtimes', 'logs'];
            for (const dir of subdirs) {
                const dirPath = path.join(selectedPath, dir);
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }
            }

            // Save the path to app-level store
            appLevelStore.set('dataPath', selectedPath);
            appLevelStore.set('onboardingCompleted', true);

            // Reinitialize the user config store
            userConfigStore = null;
            const store = getUserConfigStore();
            
            // Set the paths in the user config
            store.set('dataPath', selectedPath);
            store.set('gamePath', path.join(selectedPath, 'gamedata'));
            store.set('instancesPath', path.join(selectedPath, 'instances'));
            store.set('skinsPath', path.join(selectedPath, 'skins'));
            store.set('capesPath', path.join(selectedPath, 'capes'));
            store.set('runtimesPath', path.join(selectedPath, 'runtimes'));
            store.set('onboardingCompleted', true);
            store.set('firstLaunchDate', new Date().toISOString());

            console.log(`[ConfigManager] Onboarding completed. Data path: ${selectedPath}`);

            return { 
                success: true, 
                path: selectedPath,
                message: 'Onboarding completed successfully'
            };
        } catch (error) {
            console.error('[ConfigManager] Onboarding failed:', error);
            return { 
                success: false, 
                error: String(error) 
            };
        }
    }
}
