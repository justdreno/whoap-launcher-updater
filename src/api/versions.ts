export interface MinecraftVersion {
    id: string;
    type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha';
    releaseTime: string;
}

export interface FabricLoader {
    version: string;
    stable: boolean;
}

export const VersionsApi = {
    getVanilla: async (): Promise<{ latest: { release: string; snapshot: string }; versions: MinecraftVersion[] }> => {
        const result = await window.ipcRenderer.invoke('versions:get-vanilla');
        if (!result.success) throw new Error(result.error);
        return { latest: result.latest, versions: result.versions };
    },

    getFabricLoaders: async (): Promise<FabricLoader[]> => {
        const result = await window.ipcRenderer.invoke('versions:get-fabric-loaders');
        if (!result.success) throw new Error(result.error);
        return result.loaders;
    },

    getFabricGames: async (): Promise<{ version: string; stable: boolean }[]> => {
        const result = await window.ipcRenderer.invoke('versions:get-fabric-games');
        if (!result.success) throw new Error(result.error);
        return result.versions;
    },

    getVersionDetails: async (versionId: string): Promise<any> => {
        const result = await window.ipcRenderer.invoke('versions:get-details', versionId);
        if (!result.success) throw new Error(result.error);
        return result.details;
    },

    refresh: async (): Promise<void> => {
        await window.ipcRenderer.invoke('versions:refresh');
    }
};
