import { ipcMain, net } from 'electron';

const VANILLA_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const FABRIC_LOADER_URL = 'https://meta.fabricmc.net/v2/versions/loader';
const FABRIC_GAME_URL = 'https://meta.fabricmc.net/v2/versions/game';
const FORGE_MANIFEST_URL = 'https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml';
const NEOFORGE_MANIFEST_URL = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';

export interface MinecraftVersion {
    id: string;
    type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
    url: string;
    releaseTime: string;
}

export interface FabricLoaderVersion {
    version: string;
    stable: boolean;
}

export interface VersionManifest {
    latest: {
        release: string;
        snapshot: string;
    };
    versions: MinecraftVersion[];
}

// Helper to fetch JSON using Electron's net module (bypasses CORS issues)
async function fetchJson<T>(url: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const request = net.request(url);
        let data = '';

        request.on('response', (response) => {
            response.on('data', (chunk) => {
                data += chunk.toString();
            });
            response.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Failed to parse JSON from ' + url));
                }
            });
            response.on('error', (err) => {
                reject(err);
            });
        });

        request.on('error', (err) => {
            reject(err);
        });

        request.end();
    });
}

export class VersionManager {
    private vanillaManifest: VersionManifest | null = null;
    private fabricLoaders: FabricLoaderVersion[] = [];
    private fabricGames: { version: string; stable: boolean }[] = [];
    private forgeVersions: string[] = [];
    private neoforgeVersions: string[] = [];

    constructor() {
        this.registerListeners();
        console.log('[VersionManager] Initialized');
    }

    private registerListeners() {
        // Fetch Vanilla versions
        ipcMain.handle('versions:get-vanilla', async () => {
            console.log('[VersionManager] Fetching vanilla versions...');
            try {
                if (!this.vanillaManifest) {
                    this.vanillaManifest = await fetchJson<VersionManifest>(VANILLA_MANIFEST_URL);
                    console.log('[VersionManager] Loaded', this.vanillaManifest.versions.length, 'vanilla versions');
                }
                return {
                    success: true,
                    latest: this.vanillaManifest.latest,
                    versions: this.vanillaManifest.versions
                };
            } catch (error) {
                console.error('[VersionManager] Failed to fetch vanilla manifest:', error);
                return { success: false, error: String(error) };
            }
        });

        // Fetch Fabric loaders
        ipcMain.handle('versions:get-fabric-loaders', async () => {
            try {
                if (this.fabricLoaders.length === 0) {
                    const loaders = await fetchJson<{ version: string; stable: boolean }[]>(FABRIC_LOADER_URL);
                    this.fabricLoaders = loaders.map(l => ({ version: l.version, stable: l.stable }));
                }
                return { success: true, loaders: this.fabricLoaders };
            } catch (error) {
                console.error('[VersionManager] Failed to fetch Fabric loaders:', error);
                return { success: false, error: String(error) };
            }
        });

        // Fetch Fabric-compatible game versions
        ipcMain.handle('versions:get-fabric-games', async () => {
            try {
                if (this.fabricGames.length === 0) {
                    this.fabricGames = await fetchJson<{ version: string; stable: boolean }[]>(FABRIC_GAME_URL);
                }
                return { success: true, versions: this.fabricGames };
            } catch (error) {
                console.error('[VersionManager] Failed to fetch Fabric game versions:', error);
                return { success: false, error: String(error) };
            }
        });

        // Fetch Forge versions for a game version
        ipcMain.handle('versions:get-forge-loaders', async (_, gameVersion: string) => {
            return await VersionManager.getForgeLoaders(gameVersion);
        });

        // Fetch NeoForge versions for a game version
        ipcMain.handle('versions:get-neoforge-loaders', async (_, gameVersion: string) => {
            return await VersionManager.getNeoForgeLoaders(gameVersion);
        });

        // Fetch Quilt versions for a game version
        ipcMain.handle('versions:get-quilt-loaders', async (_, gameVersion: string) => {
            return await VersionManager.getQuiltLoaders(gameVersion);
        });

        // Get version details (for downloading assets/libraries)
        ipcMain.handle('versions:get-details', async (_, versionId: string) => {
            try {
                if (!this.vanillaManifest) {
                    this.vanillaManifest = await fetchJson<VersionManifest>(VANILLA_MANIFEST_URL);
                }

                const version = this.vanillaManifest.versions.find(v => v.id === versionId);
                if (!version) {
                    return { success: false, error: 'Version not found' };
                }

                // Fetch the detailed version JSON
                const details = await fetchJson<any>(version.url);
                return { success: true, details };
            } catch (error) {
                console.error('[VersionManager] Failed to fetch version details:', error);
                return { success: false, error: String(error) };
            }
        });

        // Clear cache (useful for refreshing)
        ipcMain.handle('versions:refresh', async () => {
            this.vanillaManifest = null;
            this.fabricLoaders = [];
            this.fabricGames = [];
            return { success: true };
        });
    }

    static async getForgeLoaders(gameVersion: string): Promise<any> {
        try {
            const data = await fetchJson<any>(`https://meta.creeperhost.net/minecraft/forge/versions/${gameVersion}`);
            return { success: true, loaders: data || [] };
        } catch (error) {
            console.error('[VersionManager] Failed to fetch Forge loaders:', error);
            return { success: false, error: String(error) };
        }
    }

    static async getNeoForgeLoaders(gameVersion: string): Promise<any> {
        try {
            const text = await VersionManager.fetchText(NEOFORGE_MANIFEST_URL);
            const versions = [...text.matchAll(/<version>(.*?)<\/version>/g)].map(m => m[1]);
            const filtered = versions.filter(v => v.startsWith(gameVersion) || v.includes(gameVersion)).reverse();
            return { success: true, loaders: filtered };
        } catch (error) {
            console.error('[VersionManager] Failed to fetch NeoForge loaders:', error);
            return { success: false, error: String(error) };
        }
    }

    static async getQuiltLoaders(gameVersion: string): Promise<any> {
        try {
            const data = await fetchJson<any>(`https://meta.quiltmc.org/v3/versions/loader/${gameVersion}`);
            return { success: true, loaders: data.map((l: any) => ({ id: l.loader.version, stable: true })) };
        } catch (error) {
            console.error('[VersionManager] Failed to fetch Quilt loaders:', error);
            return { success: false, error: String(error) };
        }
    }

    private static async fetchText(url: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const request = net.request(url);
            let data = '';
            request.on('response', (response) => {
                response.on('data', (chunk) => data += chunk.toString());
                response.on('end', () => resolve(data));
                response.on('error', (err) => reject(err));
            });
            request.on('error', (err) => reject(err));
            request.end();
        });
    }

    // Static helper for internal use (LaunchProcess)
    static async getVersionDetails(versionId: string): Promise<any> {
        // This is a quick hack to reuse the existing logic without properly refactoring into a shared service
        // In a real app, the manifest fetching and caching should be a singleton service
        const VANILLA_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
        const manifest = await fetchJson<VersionManifest>(VANILLA_MANIFEST_URL);
        const version = manifest.versions.find(v => v.id === versionId);
        if (!version) return null;
        return await fetchJson<any>(version.url);
    }
}
