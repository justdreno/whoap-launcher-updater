import { app, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { ConfigManager } from './ConfigManager';
import { VersionUtils } from '../utils/VersionUtils';
import { VersionManager } from '../launcher/VersionManager';
import AdmZip from 'adm-zip';
import { dialog } from 'electron';

export interface Instance {
    id: string;
    name: string;
    version: string;
    loader: 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt';
    created: number;
    lastPlayed: number;
    type?: 'created' | 'imported';
    isFavorite?: boolean;
    isImported?: boolean;
    launchVersionId?: string; // The actual ID to launch (e.g. fabric-loader-x.x.x-1.20.1)
    useExternalPath?: boolean; // If true, launch using the original version folder as gameDir
    icon?: string; // URL or path to custom icon
    playTime?: number; // Total playtime in seconds
}

export class InstanceManager {
    private static instance: InstanceManager;
    private instancesPath: string;

    private constructor() {
        this.instancesPath = ConfigManager.getInstancesPath();
        console.log("InstanceManager initialized. Path:", this.instancesPath);
        this.ensureInstancesDirectory();
        this.registerListeners();
    }

    public static getInstance(): InstanceManager {
        if (!InstanceManager.instance) {
            InstanceManager.instance = new InstanceManager();
        }
        return InstanceManager.instance;
    }
    // ... (rest of class remains, skipping to createInstance modification)


    private ensureInstancesDirectory() {
        if (!existsSync(this.instancesPath)) {
            mkdirSync(this.instancesPath, { recursive: true });
        }
    }

    private registerListeners() {
        ipcMain.handle('instance:create', async (_, data: { name: string; version: string; loader?: string, loaderVersion?: string }) => {
            try {
                return await this.createInstance(data.name, data.version, data.loader, data.loaderVersion);
            } catch (error) {
                console.error("Failed to create instance:", error);
                return { success: false, error: String(error) };
            }
        });

        ipcMain.handle('meta:get-fabric-loaders', async (_, version: string) => {
            return await this.getFabricLoaders(version);
        });

        ipcMain.handle('meta:get-forge-loaders', async (_, version: string) => {
            return await VersionManager.getForgeLoaders(version);
        });

        ipcMain.handle('meta:get-neoforge-loaders', async (_, version: string) => {
            return await VersionManager.getNeoForgeLoaders(version);
        });

        ipcMain.handle('meta:get-quilt-loaders', async (_, version: string) => {
            return await VersionManager.getQuiltLoaders(version);
        });

        ipcMain.handle('instance:list', async () => {
            try {
                return await this.getInstances();
            } catch (error) {
                console.error("Failed to list instances:", error);
                return [];
            }
        });

        ipcMain.handle('instance:delete', async (_, id: string) => {
            try {
                return await this.deleteInstance(id);
            } catch (error) {
                console.error("Failed to delete instance:", error);
                return { success: false, error: String(error) };
            }
        });

        ipcMain.handle('meta:get-versions', async () => {
            try {
                return await this.fetchVersions();
            } catch (error) {
                console.error("Failed to fetch versions:", error);
                return [];
            }
        });

        ipcMain.handle('instance:toggle-favorite', async (_, instanceId: string) => {
            return await this.toggleFavorite(instanceId);
        });

        ipcMain.handle('instance:get-options', async (_, instanceId: string) => {
            const instancePath = path.join(this.instancesPath, instanceId);
            if (existsSync(instancePath)) {
                const { GameOptionsManager } = await import('./GameOptionsManager');
                return await GameOptionsManager.readOptions(instancePath);
            }
            return {};
        });

        ipcMain.handle('instance:open-folder', async (_, instanceId: string) => {
            const { shell } = require('electron');
            const instancePath = this.resolveInstancePath(instanceId);

            if (instancePath) {
                await shell.openPath(instancePath);
                return { success: true };
            }
            return { success: false, error: 'Instance path not found' };
        });

        ipcMain.handle('instance:update-last-played', async (_, id: string) => {
            await this.updateLastPlayed(id);
        });

        ipcMain.handle('instance:add-playtime', async (_, id: string, seconds: number) => {
            await this.addPlayTime(id, seconds);
        });

        ipcMain.handle('instance:duplicate', async (_, instanceId: string, newName: string) => {
            console.log(`IPC instance:duplicate called for ${instanceId} -> ${newName}`);
            try {
                return await this.duplicateInstance(instanceId, newName);
            } catch (error) {
                console.error("Failed to duplicate instance:", error);
                return { success: false, error: String(error) };
            }
        });


        ipcMain.handle('instance:export', async (_, instanceId: string) => {
            try {
                return await this.exportInstance(instanceId);
            } catch (error) {
                console.error("Failed to export instance:", error);
                return { success: false, error: String(error) };
            }
        });

        ipcMain.handle('instance:import', async (event) => {
            try {
                return await this.importInstance(event);
            } catch (error) {
                console.error("Failed to import instance:", error);
                return { success: false, error: String(error) };
            }
        });

        ipcMain.handle('instance:rename', async (_, instanceId: string, newName: string) => {
            console.log(`IPC instance:rename called for ${instanceId} -> ${newName}`);
            try {
                return await this.renameInstance(instanceId, newName);
            } catch (error) {
                console.error("Failed to rename instance:", error);
                return { success: false, error: String(error) };
            }
        });

        ipcMain.handle('instance:import-external', async (event, versionIds: string[]) => {
            try {
                return await this.importExternalInstances(event, versionIds);
            } catch (error) {
                console.error("Failed to import external instances:", error);
                return { success: false, error: String(error) };
            }
        });

        ipcMain.handle('instance:update-icon', async (_, instanceId: string, iconUrl: string | null) => {
            try {
                return await this.updateInstanceIcon(instanceId, iconUrl);
            } catch (error) {
                console.error("Failed to update instance icon:", error);
                return { success: false, error: String(error) };
            }
        });

        // World Management Handlers
        ipcMain.handle('worlds:list', async (_, instanceId: string) => {
            try {
                return await this.listWorlds(instanceId);
            } catch (error) {
                console.error("Failed to list worlds:", error);
                return [];
            }
        });

        ipcMain.handle('worlds:backup', async (_, instanceId: string, worldId: string) => {
            try {
                return await this.backupWorld(instanceId, worldId);
            } catch (error) {
                console.error("Failed to backup world:", error);
                return { success: false, error: String(error) };
            }
        });

        ipcMain.handle('worlds:delete', async (_, instanceId: string, worldId: string) => {
            try {
                return await this.deleteWorld(instanceId, worldId);
            } catch (error) {
                console.error("Failed to delete world:", error);
                return { success: false, error: String(error) };
            }
        });

        ipcMain.handle('worlds:transfer', async (_, instanceId: string, worldId: string, targetInstanceId: string) => {
            try {
                return await this.transferWorld(instanceId, worldId, targetInstanceId);
            } catch (error) {
                console.error("Failed to transfer world:", error);
                return { success: false, error: String(error) };
            }
        });

        ipcMain.handle('worlds:open-folder', async (_, instanceId: string, worldId: string) => {
            try {
                return await this.openWorldFolder(instanceId, worldId);
            } catch (error) {
                console.error("Failed to open world folder:", error);
                return { success: false, error: String(error) };
            }
        });

        ipcMain.handle('worlds:list-backups', async () => {
            try {
                return await this.listBackups();
            } catch (error) {
                console.error("Failed to list backups:", error);
                return [];
            }
        });

        ipcMain.handle('worlds:restore-backup', async (_, backupId: string) => {
            try {
                return await this.restoreBackup(backupId);
            } catch (error) {
                console.error("Failed to restore backup:", error);
                return { success: false, error: String(error) };
            }
        });

        ipcMain.handle('worlds:delete-backup', async (_, backupId: string) => {
            try {
                return await this.deleteBackup(backupId);
            } catch (error) {
                console.error("Failed to delete backup:", error);
                return { success: false, error: String(error) };
            }
        });

        ipcMain.handle('worlds:list-all', async () => {
            try {
                const allWorlds: any[] = [];
                const instances = await this.getInstances();
                
                for (const instance of instances) {
                    const worlds = await this.listWorlds(instance.id);
                    allWorlds.push(...worlds);
                }
                
                return allWorlds;
            } catch (error) {
                console.error("Failed to list all worlds:", error);
                return [];
            }
        });
    }

    private resolveInstancePath(instanceId: string): string | null {
        console.log(`Resolving path for ID: ${instanceId}`);
        // 1. Check local instances (Whoap/instances)
        let p = path.join(this.instancesPath, instanceId);
        if (existsSync(p)) {
            // For imported instances, check if useExternalPath flag is set
            const configPath = path.join(p, 'instance.json');
            if (existsSync(configPath)) {
                try {
                    const content = readFileSync(configPath, 'utf-8');
                    const config = JSON.parse(content);
                    if (config.useExternalPath || config.isImported || config.type === 'imported') {
                        // Return the external path instead for game data operations
                        const externalPath = path.join(ConfigManager.getGamePath(), 'versions', instanceId);
                        if (existsSync(externalPath)) {
                            console.log(`Imported instance - using external path: ${externalPath}`);
                            return externalPath;
                        }
                    }
                } catch (e) {
                    console.warn('Failed to read instance.json for path resolution:', e);
                }
            }
            console.log(`Found local instance at: ${p}`);
            return p;
        }

        // 2. Check external versions (.minecraft/versions)
        p = path.join(ConfigManager.getGamePath(), 'versions', instanceId);
        if (existsSync(p)) {
            console.log(`Found external instance at: ${p}`);
            return p;
        }

        console.log("Instance path NOT found.");
        return null;
    }

    private getFavoritesPath(): string {
        return path.join(ConfigManager.getDataPath(), 'favorites.json');
    }

    private async loadFavorites(): Promise<string[]> {
        try {
            const p = this.getFavoritesPath();
            if (existsSync(p)) {
                return JSON.parse(await fs.readFile(p, 'utf-8'));
            }
        } catch { }
        return [];
    }

    private async toggleFavorite(instanceId: string) {
        const favorites = await this.loadFavorites();
        const index = favorites.indexOf(instanceId);
        if (index === -1) {
            favorites.push(instanceId);
        } else {
            favorites.splice(index, 1);
        }
        await fs.writeFile(this.getFavoritesPath(), JSON.stringify(favorites));
        return { success: true, isFavorite: index === -1 };
    }

    async updateLastPlayed(instanceId: string) {
        const instancePath = path.join(this.instancesPath, instanceId);
        if (existsSync(instancePath)) {
            try {
                const configPath = path.join(instancePath, 'instance.json');
                const content = await fs.readFile(configPath, 'utf-8');
                const data = JSON.parse(content);
                data.lastPlayed = Date.now();
                await fs.writeFile(configPath, JSON.stringify(data, null, 4));
            } catch (e) {
                console.error("Failed to update last played", e);
            }
        }
    }

    async addPlayTime(instanceId: string, seconds: number) {
        const instancePath = path.join(this.instancesPath, instanceId);
        if (existsSync(instancePath)) {
            try {
                const configPath = path.join(instancePath, 'instance.json');
                const content = await fs.readFile(configPath, 'utf-8');
                const data = JSON.parse(content);
                data.playTime = (data.playTime || 0) + seconds;
                await fs.writeFile(configPath, JSON.stringify(data, null, 4));
                console.log(`[InstanceManager] Added ${seconds}s playtime to ${instanceId}. Total: ${data.playTime}s`);
            } catch (e) {
                console.error("Failed to update playtime", e);
            }
        }
    }

    async fetchVersions() {
        // Fetch from Mojang's Piston Meta
        const response = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
        const data = await response.json();
        return data.versions.filter((v: any) => v.type === 'release'); // Only return releases for now
    }

    async getFabricLoaders(gameVersion: string) {
        try {
            const res = await fetch(`https://meta.fabricmc.net/v2/versions/loader/${gameVersion}`);
            const data = await res.json();
            return data.map((l: any) => ({
                id: l.loader.version,
                stable: l.loader.stable
            }));
        } catch (e) {
            console.error("Failed to fetch fabric loaders", e);
            return [];
        }
    }

    async createInstance(name: string, version: string, loader: string = 'vanilla', loaderVersion?: string) {
        const folderName = name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const instancePath = path.join(this.instancesPath, folderName);

        if (existsSync(instancePath)) {
            throw new Error("Instance with this name/folder already exists.");
        }

        // Install Mod Loader if requested
        let launchVersionId = version; // Default to vanilla version

        if (loader === 'fabric' || loader === 'quilt') {
            try {
                // If specific loader version not provided, fetch stable defaults
                let targetLoaderVersion = loaderVersion;

                if (!targetLoaderVersion) {
                    // 1. Fetch stable loader version for this game version
                    const metaUrl = loader === 'fabric'
                        ? `https://meta.fabricmc.net/v2/versions/loader/${version}`
                        : `https://meta.quiltmc.org/v3/versions/loader/${version}`;

                    const metaRes = await fetch(metaUrl);
                    const metaData = await metaRes.json();

                    if (metaData && metaData.length > 0) {
                        const bestLoader = metaData.find((l: any) => l.loader?.stable || l.stable) || metaData[0];
                        targetLoaderVersion = bestLoader.loader?.version || bestLoader.version;
                    }
                }

                if (targetLoaderVersion) {
                    // 2. Fetch the actual profile JSON
                    // Format: https://meta.fabricmc.net/v2/versions/loader/<game_version>/<loader_version>/profile/json (Same for Quilt mostly)
                    const baseUrl = loader === 'fabric' ? 'https://meta.fabricmc.net' : 'https://meta.quiltmc.org';
                    const profileRes = await fetch(`${baseUrl}/v2/versions/loader/${version}/${targetLoaderVersion}/profile/json`);
                    const profileJson = await profileRes.json();

                    const versionId = profileJson.id;
                    const versionsDir = path.join(ConfigManager.getGamePath(), 'versions');
                    const versionDir = path.join(versionsDir, versionId);

                    if (!existsSync(versionDir)) {
                        await fs.mkdir(versionDir, { recursive: true });
                        await fs.writeFile(path.join(versionDir, `${versionId}.json`), JSON.stringify(profileJson, null, 4));
                    }

                    launchVersionId = versionId;
                }
            } catch (e) {
                console.warn(`Failed to install ${loader} loader`, e);
            }
        } else if ((loader === 'forge' || loader === 'neoforge') && loaderVersion) {
            // For Forge/NeoForge, we use the standard naming convention
            // e.g. "1.20.1-forge-47.2.0" or "1.21.1-neoforge-21.1.0"
            launchVersionId = loader === 'forge'
                ? `${version}-forge-${loaderVersion}`
                : `${loaderVersion}`; // NeoForge versions are often just the ID now

            // Check if this version already exists in .minecraft/versions
            const versionsDir = path.join(ConfigManager.getGamePath(), 'versions');
            const versionDir = path.join(versionsDir, launchVersionId);

            if (!existsSync(versionDir)) {
                console.log(`[CreateInstance] ${loader} version ${launchVersionId} not found in versions folder.`);
                // In a future update, we could add downlaoder logic here.
                // For now, we'll create the instance and it will show as "Missing" or fail at launch with a clear error.
            }
        }

        const instanceData: Instance = {
            id: folderName,
            name: name,
            version: version,
            loader: loader as 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt',
            created: Date.now(),
            lastPlayed: 0,
            type: 'created',
            launchVersionId: launchVersionId
        };

        await fs.mkdir(instancePath, { recursive: true });
        await fs.writeFile(
            path.join(instancePath, 'instance.json'),
            JSON.stringify(instanceData, null, 4)
        );

        return { success: true, instance: instanceData };
    }

    async deleteInstance(instanceId: string) {
        const instancePath = this.resolveInstancePath(instanceId);

        if (instancePath) {
            // Check if it's in the instances folder to allow safe deletion
            // Or allow deleting external versions too? User asked for "really delete".
            // Let's allow it but maybe careful.
            await fs.rm(instancePath, { recursive: true, force: true });
            return { success: true };
        }
        return { success: false, error: "Instance not found" };
    }

    async renameInstance(instanceId: string, newName: string) {
        const instancePath = this.resolveInstancePath(instanceId);
        if (!instancePath) throw new Error("Instance not found");

        const configPath = path.join(instancePath, 'instance.json');
        if (existsSync(configPath)) {
            const content = await fs.readFile(configPath, 'utf-8');
            const data = JSON.parse(content);
            data.name = newName;
            await fs.writeFile(configPath, JSON.stringify(data, null, 4));
            return { success: true };
        } else {
            throw new Error("Cannot rename this instance type (no instance.json)");
        }
    }

    async updateInstanceIcon(instanceId: string, iconUrl: string | null) {
        const instancePath = path.join(this.instancesPath, instanceId);
        if (!existsSync(instancePath)) {
            return { success: false, error: "Instance not found" };
        }

        const configPath = path.join(instancePath, 'instance.json');
        if (existsSync(configPath)) {
            const content = await fs.readFile(configPath, 'utf-8');
            const data = JSON.parse(content);
            if (iconUrl) {
                data.icon = iconUrl;
            } else {
                delete data.icon;
            }
            await fs.writeFile(configPath, JSON.stringify(data, null, 4));
            return { success: true };
        }
        return { success: false, error: "Instance config not found" };
    }

    async getInstances(): Promise<Instance[]> {
        const instances: Instance[] = [];
        const externalVersions: Instance[] = [];
        const favorites = await this.loadFavorites();

        // 1. Scan Native Instances (Whoap Created)
        if (existsSync(this.instancesPath)) {
            const entries = await fs.readdir(this.instancesPath, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const configPath = path.join(this.instancesPath, entry.name, 'instance.json');
                    if (existsSync(configPath)) {
                        try {
                            const content = await fs.readFile(configPath, 'utf-8');
                            const data = JSON.parse(content);
                            instances.push({
                                ...data,
                                type: 'created',
                                isFavorite: favorites.includes(data.id),
                                isImported: false
                            });
                        } catch (e) {
                            console.warn(`Failed to load instance from ${entry.name}`, e);
                        }
                    }
                }
            }
        }

        // 2. Scan External/Shared Versions (TLauncher/Vanilla) from Configured Game Path
        // [MODIFIED] Auto-scan disabled as per user request to only show imported versions.
        /*
        const gamePath = ConfigManager.getGamePath();
        const versionsPath = path.join(gamePath, 'versions');

        if (existsSync(versionsPath)) {
            try {
                const folders = readdirSync(versionsPath);
                for (const folder of folders) {
                    // Avoid duplicating if we already have a created instance with this exact ID
                    if (!instances.some(i => i.id === folder)) {
                        // Check if it looks like a version (has json)
                        const jsonPath = path.join(versionsPath, folder, `${folder}.json`);

                        // TLauncher/Standard requirement: JSON must exist.
                        if (existsSync(jsonPath)) {
                            // Detect Loader
                            const loaderType = this.detectLoader(jsonPath, folder);

                            // Detect Version Robustly
                            const cleanVersion = this.extractVersion(jsonPath, folder);

                            externalVersions.push({
                                id: folder,
                                name: folder, // Clean name
                                version: cleanVersion,
                                loader: loaderType as any,
                                created: 0,
                                lastPlayed: 0,
                                type: 'imported',
                                isFavorite: favorites.includes(folder),
                                isImported: true
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn("Failed to scan external versions", e);
            }
        }
        */

        const allInstances = [...instances, ...externalVersions];

        // Sort: Favorites first, then created flag? No, favorites first, then Version/Name
        return allInstances.sort((a, b) => {
            if (a.isFavorite && !b.isFavorite) return -1;
            if (!a.isFavorite && b.isFavorite) return 1;

            // Then by valid version number
            const parseVersion = (v: string) => {
                const parts = v.toString().replace(/[^0-9.]/g, '').split('.').map(n => parseInt(n) || 0);
                return parts[0] * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
            };
            return parseVersion(b.version) - parseVersion(a.version);
        });
    }

    private detectLoader(jsonPath: string, id: string): string {
        const info = VersionUtils.getInfo(jsonPath, id);
        return info.loader;
    }

    private extractVersion(jsonPath: string, folderName: string): string {
        const info = VersionUtils.getInfo(jsonPath, folderName);
        return info.mcVersion;
    }

    async duplicateInstance(instanceId: string, newName: string) {
        const sourcePath = this.resolveInstancePath(instanceId);

        if (!sourcePath) {
            throw new Error('Source instance not found');
        }

        // Create new folder name
        const newFolderName = newName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const destPath = path.join(this.instancesPath, newFolderName);

        if (existsSync(destPath)) {
            throw new Error('An instance with this name already exists');
        }

        // Recursively copy folder
        try {
            await this.copyDirectory(sourcePath, destPath);
        } catch (e) {
            console.error(`Duplicate failed: ${e}`);
            throw e;
        }

        // Update or Create instance.json
        const configPath = path.join(destPath, 'instance.json');

        if (existsSync(configPath)) {
            const content = await fs.readFile(configPath, 'utf-8');
            const data = JSON.parse(content);
            data.id = newFolderName;
            data.name = newName;
            data.created = Date.now();
            data.lastPlayed = 0;
            await fs.writeFile(configPath, JSON.stringify(data, null, 4));
        } else {
            // No instance.json (likely external/vanilla version)
            // We need to generate one so it shows up in Whoap
            let version = 'unknown';
            let loader = 'vanilla';

            try {
                // Find the main version JSON
                const entries = await fs.readdir(destPath);
                const jsonFile = entries.find(f => f.endsWith('.json') && f !== 'instance.json');

                if (jsonFile) {
                    const jsonPath = path.join(destPath, jsonFile);
                    version = this.extractVersion(jsonPath, newFolderName);
                    loader = this.detectLoader(jsonPath, newFolderName);
                }
            } catch (e) {
                console.warn("Failed to detect version for duplicate", e);
            }

            const data: Instance = {
                id: newFolderName,
                name: newName,
                version: version,
                loader: loader as any,
                created: Date.now(),
                lastPlayed: 0,
                type: 'created'
            };
            await fs.writeFile(configPath, JSON.stringify(data, null, 4));
        }

        return { success: true, instanceId: newFolderName };
    }

    private async copyDirectory(src: string, dest: string) {
        await fs.mkdir(dest, { recursive: true });
        const entries = await fs.readdir(src, { withFileTypes: true });

        for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);

            if (entry.isDirectory()) {
                await this.copyDirectory(srcPath, destPath);
            } else {
                await fs.copyFile(srcPath, destPath);
            }
        }
    }



    async exportInstance(instanceId: string) {
        const instancePath = this.resolveInstancePath(instanceId);

        if (!instancePath) {
            throw new Error('Instance not found');
        }

        const { filePath } = await dialog.showSaveDialog({
            title: 'Export Instance',
            defaultPath: `${instanceId}.zip`,
            filters: [{ name: 'Zip Files', extensions: ['zip'] }]
        });

        if (!filePath) return { success: false, canceled: true };

        const zip = new AdmZip();
        zip.addLocalFolder(instancePath);

        // Check if instance.json exists, if not, generate and add it
        const configPath = path.join(instancePath, 'instance.json');
        if (!existsSync(configPath)) {
            let version = 'unknown';
            let loader = 'vanilla';
            try {
                const entries = await fs.readdir(instancePath);
                const jsonFile = entries.find(f => f.endsWith('.json') && f !== 'instance.json');
                if (jsonFile) {
                    const jsonPath = path.join(instancePath, jsonFile);
                    version = this.extractVersion(jsonPath, instanceId);
                    loader = this.detectLoader(jsonPath, instanceId);
                }
            } catch (e) { }

            const data: Instance = {
                id: instanceId, // Use original ID/Name for export
                name: instanceId,
                version: version,
                loader: loader as any,
                created: Date.now(),
                lastPlayed: 0,
                type: 'created'
            };
            zip.addFile('instance.json', Buffer.from(JSON.stringify(data, null, 4)));
        }

        zip.writeZip(filePath);

        return { success: true, filePath };
    }

    async importInstance(event?: any) {
        const { filePaths } = await dialog.showOpenDialog({
            title: 'Import Instance / Modpack',
            properties: ['openFile'],
            filters: [{ name: 'Minecraft Files', extensions: ['zip', 'mrpack'] }]
        });

        if (!filePaths || filePaths.length === 0) return { success: false, canceled: true };

        event?.sender.send('instance:import-progress', { status: 'Reading zip file...', progress: 10 });

        const zipPath = filePaths[0];
        const zip = new AdmZip(zipPath);
        const zipEntries = zip.getEntries();

        // 1. Detect if it's a Modpack (Modrinth or CurseForge)
        const isModrinth = zipEntries.some(e => e.entryName === 'modrinth.index.json');
        const isCurseForge = zipEntries.some(e => e.entryName === 'manifest.json');

        if (isModrinth || isCurseForge) {
            console.log(`[InstanceManager] Detected modpack import (${isModrinth ? 'Modrinth' : 'CurseForge'})`);
            event?.sender.send('instance:import-progress', { status: 'Initializing modpack installer...', progress: 20 });

            const { ModpackInstaller } = await import('../utils/ModpackInstaller');
            try {
                return await ModpackInstaller.installFromLocalZip(zipPath, (status, progress) => {
                    event?.sender.send('instance:import-progress', { status, progress });
                });
            } catch (error: any) {
                console.error("[InstanceManager] Modpack import failed:", error);
                return { success: false, error: `Modpack import failed: ${error.message}` };
            }
        }

        // 2. Fallback to Native Whoap Instance Import
        const configEntry = zipEntries.find(entry => entry.entryName === 'instance.json');

        if (!configEntry) {
            throw new Error('Invalid file: instance.json or modpack manifest not found inside zip.');
        }

        event?.sender.send('instance:import-progress', { status: 'Parsing configuration...', progress: 30 });

        const configContent = configEntry.getData().toString('utf8');
        let config;
        try {
            config = JSON.parse(configContent);
        } catch (e) {
            throw new Error('Invalid instance.json file');
        }

        // Logic to avoid overwriting existing instance
        let newInstanceId = config.id || path.basename(zipPath, '.zip').toLowerCase().replace(/[^a-z0-9]/g, '_');
        let counter = 1;
        while (existsSync(path.join(this.instancesPath, newInstanceId))) {
            newInstanceId = `${config.id}_${counter}`;
            counter++;
        }

        event?.sender.send('instance:import-progress', { status: 'Extracting files...', progress: 50 });

        const destPath = path.join(this.instancesPath, newInstanceId);
        zip.extractAllTo(destPath, true);

        // Update ID in the extracted config if it changed
        if (config.id !== newInstanceId) {
            config.id = newInstanceId;
            // Optionally update name if duplicated? Keep name same for now.
            await fs.writeFile(path.join(destPath, 'instance.json'), JSON.stringify(config, null, 4));
        }

        event?.sender.send('instance:import-progress', { status: 'Finalizing...', progress: 100 });

        return { success: true, instanceId: newInstanceId };
    }

    async importExternalInstances(event: any, versionIds: string[]) {
        const gamePath = ConfigManager.getGamePath();
        const versionsPath = path.join(gamePath, 'versions');
        const results: { success: boolean, id: string, error?: string }[] = [];

        const total = versionIds.length;
        let current = 0;

        // Parallel import with concurrency limit
        const limit = 5; // Increased limit because we are just writing small files now
        const chunks: string[][] = [];
        for (let i = 0; i < versionIds.length; i += limit) {
            chunks.push(versionIds.slice(i, i + limit));
        }

        for (const chunk of chunks) {
            await Promise.all(chunk.map(async (id) => {
                try {
                    const sourcePath = path.join(versionsPath, id);
                    if (!existsSync(sourcePath)) {
                        results.push({ success: false, id, error: 'Source version not found' });
                        return;
                    }

                    const destPath = path.join(this.instancesPath, id);
                    if (existsSync(destPath)) {
                        results.push({ success: false, id, error: 'Instance already exists' });
                        return;
                    }

                    // DO NOT COPY - Just create the instance folder and config
                    await fs.mkdir(destPath, { recursive: true });

                    // Create instance.json
                    const jsonPath = path.join(sourcePath, `${id}.json`);
                    const info = existsSync(jsonPath) ? VersionUtils.getInfo(jsonPath, id) : { id, name: id, mcVersion: 'unknown', loader: 'vanilla' as const };

                    const data: Instance = {
                        id: id,
                        name: info.name,
                        version: info.mcVersion,
                        loader: info.loader,
                        created: Date.now(),
                        lastPlayed: 0,
                        type: 'imported',
                        isImported: true,
                        launchVersionId: id,
                        useExternalPath: true // This tells the launcher to use the sourcePath as gameDir
                    };

                    await fs.writeFile(path.join(destPath, 'instance.json'), JSON.stringify(data, null, 4));
                    results.push({ success: true, id });

                } catch (e) {
                    console.error(`Failed to import ${id}`, e);
                    results.push({ success: false, id, error: String(e) });
                } finally {
                    current++;
                    const progress = (current / total) * 100;
                    event.sender.send('instance:import-progress', {
                        status: `Imported ${current}/${total} versions...`,
                        progress
                    });
                }
            }));
        }

        return { success: true, results };
    }

    // ==================== WORLD MANAGEMENT ====================

    private getBackupsPath(): string {
        return path.join(ConfigManager.getDataPath(), 'world-backups');
    }

    private ensureBackupsDirectory() {
        const backupsPath = this.getBackupsPath();
        if (!existsSync(backupsPath)) {
            mkdirSync(backupsPath, { recursive: true });
        }
    }

    async listWorlds(instanceId: string): Promise<any[]> {
        const instancePath = this.resolveInstancePath(instanceId);
        if (!instancePath) return [];

        const savesPath = path.join(instancePath, 'saves');
        if (!existsSync(savesPath)) return [];

        const worlds: any[] = [];
        const entries = await fs.readdir(savesPath, { withFileTypes: true });

        for (const entry of entries) {
            if (entry.isDirectory()) {
                const worldPath = path.join(savesPath, entry.name);
                const levelDatPath = path.join(worldPath, 'level.dat');
                
                if (existsSync(levelDatPath)) {
                    try {
                        // Get world info from level.dat if possible
                        const stats = await fs.stat(worldPath);
                        const iconPath = path.join(worldPath, 'icon.png');
                        
                        let iconDataUrl: string | undefined;
                        if (existsSync(iconPath)) {
                            try {
                                const iconBuffer = await fs.readFile(iconPath);
                                iconDataUrl = `data:image/png;base64,${iconBuffer.toString('base64')}`;
                            } catch (e) {
                                console.warn(`Failed to read icon for world ${entry.name}:`, e);
                            }
                        }
                        
                        worlds.push({
                            id: entry.name,
                            name: entry.name,
                            size: await this.getFolderSize(worldPath),
                            lastPlayed: stats.mtime.getTime(),
                            gameMode: 'Unknown', // Would need to parse level.dat for this
                            icon: iconDataUrl
                        });
                    } catch (e) {
                        console.warn(`Failed to read world ${entry.name}:`, e);
                    }
                }
            }
        }

        return worlds.sort((a, b) => b.lastPlayed - a.lastPlayed);
    }

    async backupWorld(instanceId: string, worldId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const instancePath = this.resolveInstancePath(instanceId);
            if (!instancePath) {
                return { success: false, error: 'Instance not found' };
            }

            const worldPath = path.join(instancePath, 'saves', worldId);
            if (!existsSync(worldPath)) {
                return { success: false, error: 'World not found' };
            }

            this.ensureBackupsDirectory();
            const timestamp = Date.now();
            const backupId = `${instanceId}_${worldId}_${timestamp}`;
            const backupPath = path.join(this.getBackupsPath(), `${backupId}.zip`);

            const zip = new AdmZip();
            zip.addLocalFolder(worldPath);
            zip.writeZip(backupPath);

            // Save backup metadata
            const metaPath = path.join(this.getBackupsPath(), `${backupId}.json`);
            const metadata = {
                id: backupId,
                worldName: worldId,
                instanceId,
                instanceName: instanceId, // Would need to look this up
                createdAt: timestamp,
                size: (await fs.stat(backupPath)).size,
                path: backupPath
            };
            await fs.writeFile(metaPath, JSON.stringify(metadata, null, 4));

            return { success: true };
        } catch (error) {
            console.error('Failed to backup world:', error);
            return { success: false, error: String(error) };
        }
    }

    async deleteWorld(instanceId: string, worldId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const instancePath = this.resolveInstancePath(instanceId);
            if (!instancePath) {
                return { success: false, error: 'Instance not found' };
            }

            const worldPath = path.join(instancePath, 'saves', worldId);
            if (!existsSync(worldPath)) {
                return { success: false, error: 'World not found' };
            }

            await fs.rm(worldPath, { recursive: true, force: true });
            return { success: true };
        } catch (error) {
            console.error('Failed to delete world:', error);
            return { success: false, error: String(error) };
        }
    }

    async transferWorld(instanceId: string, worldId: string, targetInstanceId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const sourcePath = this.resolveInstancePath(instanceId);
            const targetPath = this.resolveInstancePath(targetInstanceId);
            
            if (!sourcePath) {
                return { success: false, error: 'Source instance not found' };
            }
            if (!targetPath) {
                return { success: false, error: 'Target instance not found' };
            }

            const sourceWorldPath = path.join(sourcePath, 'saves', worldId);
            const targetWorldPath = path.join(targetPath, 'saves', worldId);

            if (!existsSync(sourceWorldPath)) {
                return { success: false, error: 'World not found in source' };
            }

            // Ensure saves directory exists in target
            const targetSavesPath = path.join(targetPath, 'saves');
            if (!existsSync(targetSavesPath)) {
                await fs.mkdir(targetSavesPath, { recursive: true });
            }

            // Check if world already exists in target
            if (existsSync(targetWorldPath)) {
                // Rename with timestamp
                const newName = `${worldId}_transferred_${Date.now()}`;
                const finalTargetPath = path.join(targetSavesPath, newName);
                await this.copyDirectory(sourceWorldPath, finalTargetPath);
            } else {
                await this.copyDirectory(sourceWorldPath, targetWorldPath);
            }

            return { success: true };
        } catch (error) {
            console.error('Failed to transfer world:', error);
            return { success: false, error: String(error) };
        }
    }

    async openWorldFolder(instanceId: string, worldId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const { shell } = require('electron');
            const instancePath = this.resolveInstancePath(instanceId);
            if (!instancePath) {
                return { success: false, error: 'Instance not found' };
            }

            const worldPath = path.join(instancePath, 'saves', worldId);
            if (!existsSync(worldPath)) {
                return { success: false, error: 'World not found' };
            }

            await shell.openPath(worldPath);
            return { success: true };
        } catch (error) {
            console.error('Failed to open world folder:', error);
            return { success: false, error: String(error) };
        }
    }

    async listBackups(): Promise<any[]> {
        try {
            this.ensureBackupsDirectory();
            const backupsPath = this.getBackupsPath();
            const backups: any[] = [];

            const entries = await fs.readdir(backupsPath, { withFileTypes: true });
            
            for (const entry of entries) {
                if (entry.isFile() && entry.name.endsWith('.json')) {
                    try {
                        const metaPath = path.join(backupsPath, entry.name);
                        const content = await fs.readFile(metaPath, 'utf-8');
                        const metadata = JSON.parse(content);
                        
                        // Get instance name
                        const instanceConfigPath = path.join(this.instancesPath, metadata.instanceId, 'instance.json');
                        if (existsSync(instanceConfigPath)) {
                            const instanceData = JSON.parse(await fs.readFile(instanceConfigPath, 'utf-8'));
                            metadata.instanceName = instanceData.name || metadata.instanceId;
                        }
                        
                        backups.push(metadata);
                    } catch (e) {
                        console.warn('Failed to read backup metadata:', e);
                    }
                }
            }

            return backups.sort((a, b) => b.createdAt - a.createdAt);
        } catch (error) {
            console.error('Failed to list backups:', error);
            return [];
        }
    }

    async restoreBackup(backupId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const backupsPath = this.getBackupsPath();
            const metaPath = path.join(backupsPath, `${backupId}.json`);
            const zipPath = path.join(backupsPath, `${backupId}.zip`);

            if (!existsSync(metaPath) || !existsSync(zipPath)) {
                return { success: false, error: 'Backup not found' };
            }

            const metadata = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
            const instancePath = this.resolveInstancePath(metadata.instanceId);
            
            if (!instancePath) {
                return { success: false, error: 'Instance not found' };
            }

            const savesPath = path.join(instancePath, 'saves');
            if (!existsSync(savesPath)) {
                await fs.mkdir(savesPath, { recursive: true });
            }

            const worldPath = path.join(savesPath, metadata.worldName);
            
            // If world exists, rename it as backup
            if (existsSync(worldPath)) {
                const backupName = `${metadata.worldName}_backup_${Date.now()}`;
                await fs.rename(worldPath, path.join(savesPath, backupName));
            }

            // Extract backup
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(worldPath, true);

            return { success: true };
        } catch (error) {
            console.error('Failed to restore backup:', error);
            return { success: false, error: String(error) };
        }
    }

    async deleteBackup(backupId: string): Promise<{ success: boolean; error?: string }> {
        try {
            const backupsPath = this.getBackupsPath();
            const metaPath = path.join(backupsPath, `${backupId}.json`);
            const zipPath = path.join(backupsPath, `${backupId}.zip`);

            if (existsSync(metaPath)) {
                await fs.unlink(metaPath);
            }
            if (existsSync(zipPath)) {
                await fs.unlink(zipPath);
            }

            return { success: true };
        } catch (error) {
            console.error('Failed to delete backup:', error);
            return { success: false, error: String(error) };
        }
    }

    private async getFolderSize(folderPath: string): Promise<number> {
        let size = 0;
        const entries = await fs.readdir(folderPath, { withFileTypes: true });
        
        for (const entry of entries) {
            const entryPath = path.join(folderPath, entry.name);
            if (entry.isDirectory()) {
                size += await this.getFolderSize(entryPath);
            } else {
                const stats = await fs.stat(entryPath);
                size += stats.size;
            }
        }
        
        return size;
    }
}
