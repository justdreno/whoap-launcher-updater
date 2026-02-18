export interface MinecraftVersion {
    id: string;
    type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
    releaseTime: string;
}

export interface FabricLoader {
    version: string;
    stable: boolean;
}

export interface VersionCacheStatus {
    vanilla: string | null;
    fabricLoaders: string | null;
    fabricGames: string | null;
}

export interface VersionResponse<T> {
    success: boolean;
    data?: T;
    fromCache?: boolean;
    cacheAge?: number;
    error?: string;
}

export const VersionsApi = {
    getVanilla: async (): Promise<{ 
        latest: { release: string; snapshot: string }; 
        versions: MinecraftVersion[];
        fromCache?: boolean;
        cacheAge?: number;
    }> => {
        const result = await window.ipcRenderer.invoke('versions:get-vanilla');
        if (!result.success) throw new Error(result.error);
        return { 
            latest: result.latest, 
            versions: result.versions,
            fromCache: result.fromCache,
            cacheAge: result.cacheAge
        };
    },

    getFabricLoaders: async (): Promise<{
        loaders: FabricLoader[];
        fromCache?: boolean;
        cacheAge?: number;
    }> => {
        const result = await window.ipcRenderer.invoke('versions:get-fabric-loaders');
        if (!result.success) throw new Error(result.error);
        return {
            loaders: result.loaders,
            fromCache: result.fromCache,
            cacheAge: result.cacheAge
        };
    },

    getFabricGames: async (): Promise<{
        versions: { version: string; stable: boolean }[];
        fromCache?: boolean;
        cacheAge?: number;
    }> => {
        const result = await window.ipcRenderer.invoke('versions:get-fabric-games');
        if (!result.success) throw new Error(result.error);
        return {
            versions: result.versions,
            fromCache: result.fromCache,
            cacheAge: result.cacheAge
        };
    },

    getForgeLoaders: async (gameVersion: string): Promise<{
        loaders: any[];
        fromCache?: boolean;
        cacheAge?: number;
    }> => {
        const result = await window.ipcRenderer.invoke('versions:get-forge-loaders', gameVersion);
        if (!result.success) throw new Error(result.error);
        return {
            loaders: result.loaders,
            fromCache: result.fromCache,
            cacheAge: result.cacheAge
        };
    },

    getNeoForgeLoaders: async (gameVersion: string): Promise<{
        loaders: string[];
        fromCache?: boolean;
        cacheAge?: number;
    }> => {
        const result = await window.ipcRenderer.invoke('versions:get-neoforge-loaders', gameVersion);
        if (!result.success) throw new Error(result.error);
        return {
            loaders: result.loaders,
            fromCache: result.fromCache,
            cacheAge: result.cacheAge
        };
    },

    getQuiltLoaders: async (gameVersion: string): Promise<{
        loaders: any[];
        fromCache?: boolean;
        cacheAge?: number;
    }> => {
        const result = await window.ipcRenderer.invoke('versions:get-quilt-loaders', gameVersion);
        if (!result.success) throw new Error(result.error);
        return {
            loaders: result.loaders,
            fromCache: result.fromCache,
            cacheAge: result.cacheAge
        };
    },

    getVersionDetails: async (versionId: string): Promise<{
        details: any;
        fromCache?: boolean;
        cacheAge?: number;
    }> => {
        const result = await window.ipcRenderer.invoke('versions:get-details', versionId);
        if (!result.success) throw new Error(result.error);
        return {
            details: result.details,
            fromCache: result.fromCache,
            cacheAge: result.cacheAge
        };
    },

    getCacheStatus: async (): Promise<VersionCacheStatus> => {
        const result = await window.ipcRenderer.invoke('versions:cache-status');
        if (!result.success) throw new Error(result.error);
        return result.status;
    },

    refresh: async (): Promise<void> => {
        await window.ipcRenderer.invoke('versions:refresh');
    }
};
