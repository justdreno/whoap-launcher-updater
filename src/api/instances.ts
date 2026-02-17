export interface Instance {
    id: string;
    name: string;
    version: string;
    loader: 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt';
    created: number;
    lastPlayed: number;
    icon?: string;
    isFavorite?: boolean;
    isImported?: boolean;
    launchVersionId?: string;
    type?: 'created' | 'imported';
    playTime?: number;
}

export interface Version {
    id: string;
    type: string;
    url: string;
    time: string;
    releaseTime: string;
}

export const InstanceApi = {
    create: async (name: string, version: string, loader: string = 'vanilla', loaderVersion?: string): Promise<{ success: boolean; instance?: Instance; error?: string }> => {
        return window.ipcRenderer.invoke('instance:create', { name, version, loader, loaderVersion });
    },
    getFabricLoaders: async (version: string): Promise<{ id: string; stable: boolean }[]> => {
        return window.ipcRenderer.invoke('meta:get-fabric-loaders', version);
    },
    getForgeLoaders: async (version: string): Promise<string[]> => {
        const res = await window.ipcRenderer.invoke('meta:get-forge-loaders', version);
        return res.success ? res.loaders : [];
    },
    getNeoForgeLoaders: async (version: string): Promise<string[]> => {
        const res = await window.ipcRenderer.invoke('meta:get-neoforge-loaders', version);
        return res.success ? res.loaders : [];
    },
    getQuiltLoaders: async (version: string): Promise<{ id: string; stable: boolean }[]> => {
        return window.ipcRenderer.invoke('meta:get-quilt-loaders', version);
    },
    list: async (): Promise<Instance[]> => {
        return window.ipcRenderer.invoke('instance:list');
    },
    getVersions: async (): Promise<Version[]> => {
        return window.ipcRenderer.invoke('meta:get-versions');
    },
    toggleFavorite: async (id: string): Promise<{ success: boolean; isFavorite: boolean }> => {
        return window.ipcRenderer.invoke('instance:toggle-favorite', id);
    },
    updateLastPlayed: async (id: string): Promise<void> => {
        return window.ipcRenderer.invoke('instance:update-last-played', id);
    },
    delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
        return window.ipcRenderer.invoke('instance:delete', id);
    },
    duplicate: async (id: string, newName: string): Promise<{ success: boolean; instanceId?: string; error?: string }> => {
        return window.ipcRenderer.invoke('instance:duplicate', id, newName);
    },
    export: async (id: string): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> => {
        return window.ipcRenderer.invoke('instance:export', id);
    },
    import: async (): Promise<{ success: boolean; instanceId?: string; canceled?: boolean; error?: string }> => {
        return window.ipcRenderer.invoke('instance:import');
    },
    rename: async (id: string, newName: string): Promise<{ success: boolean; error?: string }> => {
        return window.ipcRenderer.invoke('instance:rename', id, newName);
    },
    openFolder: async (id: string): Promise<{ success: boolean; error?: string }> => {
        return window.ipcRenderer.invoke('instance:open-folder', id);
    },
    updateIcon: async (id: string, iconUrl: string | null): Promise<{ success: boolean; error?: string }> => {
        return window.ipcRenderer.invoke('instance:update-icon', id, iconUrl);
    }
};
