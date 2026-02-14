export interface ServerStatus {
    online: boolean;
    players?: {
        online: number;
        max: number;
    };
    version?: string;
    motd?: string;
    icon?: string;
}

export const NetworkApi = {
    getServerStatus: async (ip: string): Promise<ServerStatus> => {
        // Backend එකට කෝල් කිරීම
        return await window.ipcRenderer.invoke('network:get-server-status', ip);
    }
};