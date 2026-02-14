export interface Screenshot {
    id: string;
    filename: string;
    path: string;
    instanceId: string;
    instanceName: string;
    size: number;
    date: number;
    version?: string;
    loader?: string;
    imageDataUrl?: string; // Cached base64 data URL for rendering
}

export const ScreenshotApi = {
    list: async (): Promise<Screenshot[]> => {
        return window.ipcRenderer.invoke('screenshots:list');
    },

    delete: async (path: string): Promise<{ success: boolean; error?: string }> => {
        return window.ipcRenderer.invoke('screenshots:delete', path);
    },

    openLocation: async (path: string): Promise<{ success: boolean; error?: string }> => {
        return window.ipcRenderer.invoke('screenshots:open-location', path);
    },

    copyToClipboard: async (path: string): Promise<{ success: boolean; error?: string }> => {
        return window.ipcRenderer.invoke('screenshots:copy-to-clipboard', path);
    },

    export: async (path: string): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> => {
        return window.ipcRenderer.invoke('screenshots:export', path);
    },

    shareToCloud: async (path: string, userId: string): Promise<{ success: boolean; publicUrl?: string; hash?: string; error?: string }> => {
        return window.ipcRenderer.invoke('screenshots:share-to-cloud', path, userId);
    },

    syncFromCloud: async (userId: string, cloudScreenshots: any[]): Promise<{ success: boolean; syncedCount: number; error?: string }> => {
        return window.ipcRenderer.invoke('screenshots:sync-from-cloud', userId, cloudScreenshots);
    },

    getImage: async (path: string): Promise<{ success: boolean; dataUrl?: string; error?: string }> => {
        return window.ipcRenderer.invoke('screenshots:get-image', path);
    }
};
