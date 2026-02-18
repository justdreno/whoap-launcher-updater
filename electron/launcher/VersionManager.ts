import { ipcMain, net } from 'electron';
import { CacheManager } from '../utils/CacheManager';

const VANILLA_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const FABRIC_LOADER_URL = 'https://meta.fabricmc.net/v2/versions/loader';
const FABRIC_GAME_URL = 'https://meta.fabricmc.net/v2/versions/game';
const FORGE_MANIFEST_URL = 'https://files.minecraftforge.net/net/minecraftforge/forge/maven-metadata.xml';
const NEOFORGE_MANIFEST_URL = 'https://maven.neoforged.net/releases/net/neoforged/neoforge/maven-metadata.xml';

// Cache keys
const CACHE_KEYS = {
    VANILLA_MANIFEST: 'vanilla_manifest',
    FABRIC_LOADERS: 'fabric_loaders',
    FABRIC_GAMES: 'fabric_games',
    FORGE_VERSIONS: (version: string) => `forge_versions_${version}`,
    NEOFORGE_VERSIONS: (version: string) => `neoforge_versions_${version}`,
    QUILT_VERSIONS: (version: string) => `quilt_versions_${version}`,
    VERSION_DETAILS: (versionId: string) => `version_details_${versionId}`
};

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
                // Try to get from cache first
                const cached = await CacheManager.get<VersionManifest>(CACHE_KEYS.VANILLA_MANIFEST);
                
                // If online, fetch fresh data
                try {
                    const fresh = await fetchJson<VersionManifest>(VANILLA_MANIFEST_URL);
                    this.vanillaManifest = fresh;
                    await CacheManager.set(CACHE_KEYS.VANILLA_MANIFEST, fresh, 168); // Cache for 1 week
                    console.log('[VersionManager] Loaded', fresh.versions.length, 'vanilla versions (fresh)');
                    return {
                        success: true,
                        latest: fresh.latest,
                        versions: fresh.versions,
                        fromCache: false
                    };
                } catch (networkError) {
                    // Network failed, use cache if available
                    if (cached) {
                        console.log('[VersionManager] Using cached vanilla versions (', CacheManager.formatAge(cached.age), 'old)');
                        this.vanillaManifest = cached.data;
                        return {
                            success: true,
                            latest: cached.data.latest,
                            versions: cached.data.versions,
                            fromCache: true,
                            cacheAge: cached.age
                        };
                    }
                    throw networkError;
                }
            } catch (error) {
                console.error('[VersionManager] Failed to fetch vanilla manifest:', error);
                return { success: false, error: String(error) };
            }
        });

        // Fetch Fabric loaders
        ipcMain.handle('versions:get-fabric-loaders', async () => {
            try {
                const cached = await CacheManager.get<FabricLoaderVersion[]>(CACHE_KEYS.FABRIC_LOADERS);
                
                try {
                    const loaders = await fetchJson<{ version: string; stable: boolean }[]>(FABRIC_LOADER_URL);
                    this.fabricLoaders = loaders.map(l => ({ version: l.version, stable: l.stable }));
                    await CacheManager.set(CACHE_KEYS.FABRIC_LOADERS, this.fabricLoaders, 168);
                    return { success: true, loaders: this.fabricLoaders, fromCache: false };
                } catch (networkError) {
                    if (cached) {
                        this.fabricLoaders = cached.data;
                        return { success: true, loaders: cached.data, fromCache: true, cacheAge: cached.age };
                    }
                    throw networkError;
                }
            } catch (error) {
                console.error('[VersionManager] Failed to fetch Fabric loaders:', error);
                return { success: false, error: String(error) };
            }
        });

        // Fetch Fabric-compatible game versions
        ipcMain.handle('versions:get-fabric-games', async () => {
            try {
                const cached = await CacheManager.get<{ version: string; stable: boolean }[]>(CACHE_KEYS.FABRIC_GAMES);
                
                try {
                    this.fabricGames = await fetchJson<{ version: string; stable: boolean }[]>(FABRIC_GAME_URL);
                    await CacheManager.set(CACHE_KEYS.FABRIC_GAMES, this.fabricGames, 168);
                    return { success: true, versions: this.fabricGames, fromCache: false };
                } catch (networkError) {
                    if (cached) {
                        this.fabricGames = cached.data;
                        return { success: true, versions: cached.data, fromCache: true, cacheAge: cached.age };
                    }
                    throw networkError;
                }
            } catch (error) {
                console.error('[VersionManager] Failed to fetch Fabric game versions:', error);
                return { success: false, error: String(error) };
            }
        });

        // Fetch Forge versions for a game version
        ipcMain.handle('versions:get-forge-loaders', async (_, gameVersion: string) => {
            try {
                const cacheKey = CACHE_KEYS.FORGE_VERSIONS(gameVersion);
                const cached = await CacheManager.get<any[]>(cacheKey);
                
                try {
                    const result = await VersionManager.getForgeLoaders(gameVersion);
                    if (result.success && result.loaders) {
                        await CacheManager.set(cacheKey, result.loaders, 168);
                    }
                    return { ...result, fromCache: false };
                } catch (networkError) {
                    if (cached) {
                        return { success: true, loaders: cached.data, fromCache: true, cacheAge: cached.age };
                    }
                    throw networkError;
                }
            } catch (error) {
                return { success: false, error: String(error) };
            }
        });

        // Fetch NeoForge versions for a game version
        ipcMain.handle('versions:get-neoforge-loaders', async (_, gameVersion: string) => {
            try {
                const cacheKey = CACHE_KEYS.NEOFORGE_VERSIONS(gameVersion);
                const cached = await CacheManager.get<string[]>(cacheKey);
                
                try {
                    const result = await VersionManager.getNeoForgeLoaders(gameVersion);
                    if (result.success && result.loaders) {
                        await CacheManager.set(cacheKey, result.loaders, 168);
                    }
                    return { ...result, fromCache: false };
                } catch (networkError) {
                    if (cached) {
                        return { success: true, loaders: cached.data, fromCache: true, cacheAge: cached.age };
                    }
                    throw networkError;
                }
            } catch (error) {
                return { success: false, error: String(error) };
            }
        });

        // Fetch Quilt versions for a game version
        ipcMain.handle('versions:get-quilt-loaders', async (_, gameVersion: string) => {
            try {
                const cacheKey = CACHE_KEYS.QUILT_VERSIONS(gameVersion);
                const cached = await CacheManager.get<any[]>(cacheKey);
                
                try {
                    const result = await VersionManager.getQuiltLoaders(gameVersion);
                    if (result.success && result.loaders) {
                        await CacheManager.set(cacheKey, result.loaders, 168);
                    }
                    return { ...result, fromCache: false };
                } catch (networkError) {
                    if (cached) {
                        return { success: true, loaders: cached.data, fromCache: true, cacheAge: cached.age };
                    }
                    throw networkError;
                }
            } catch (error) {
                return { success: false, error: String(error) };
            }
        });

        // Get version details (for downloading assets/libraries)
        ipcMain.handle('versions:get-details', async (_, versionId: string) => {
            try {
                const cacheKey = CACHE_KEYS.VERSION_DETAILS(versionId);
                const cached = await CacheManager.get<any>(cacheKey);
                
                // Try to fetch fresh data
                try {
                    if (!this.vanillaManifest) {
                        this.vanillaManifest = await fetchJson<VersionManifest>(VANILLA_MANIFEST_URL);
                    }

                    const version = this.vanillaManifest.versions.find(v => v.id === versionId);
                    if (!version) {
                        return { success: false, error: 'Version not found' };
                    }

                    const details = await fetchJson<any>(version.url);
                    await CacheManager.set(cacheKey, details, 168);
                    return { success: true, details, fromCache: false };
                } catch (networkError) {
                    // Use cache if available
                    if (cached) {
                        return { success: true, details: cached.data, fromCache: true, cacheAge: cached.age };
                    }
                    throw networkError;
                }
            } catch (error) {
                console.error('[VersionManager] Failed to fetch version details:', error);
                return { success: false, error: String(error) };
            }
        });

        // Get cache status
        ipcMain.handle('versions:cache-status', async () => {
            const status = {
                vanilla: await CacheManager.getLastUpdated(CACHE_KEYS.VANILLA_MANIFEST),
                fabricLoaders: await CacheManager.getLastUpdated(CACHE_KEYS.FABRIC_LOADERS),
                fabricGames: await CacheManager.getLastUpdated(CACHE_KEYS.FABRIC_GAMES)
            };
            return { success: true, status };
        });

        // Clear cache (useful for refreshing)
        ipcMain.handle('versions:refresh', async () => {
            this.vanillaManifest = null;
            this.fabricLoaders = [];
            this.fabricGames = [];
            await CacheManager.delete(CACHE_KEYS.VANILLA_MANIFEST);
            await CacheManager.delete(CACHE_KEYS.FABRIC_LOADERS);
            await CacheManager.delete(CACHE_KEYS.FABRIC_GAMES);
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
        const cacheKey = CACHE_KEYS.VERSION_DETAILS(versionId);
        const cached = await CacheManager.get<any>(cacheKey);
        
        try {
            const VANILLA_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
            const manifest = await fetchJson<VersionManifest>(VANILLA_MANIFEST_URL);
            const version = manifest.versions.find(v => v.id === versionId);
            if (!version) return null;
            
            const details = await fetchJson<any>(version.url);
            await CacheManager.set(cacheKey, details, 168);
            return details;
        } catch (error) {
            // Return cached data if available
            if (cached) {
                console.log(`[VersionManager] Using cached version details for ${versionId}`);
                return cached.data;
            }
            return null;
        }
    }
}
