import { Instance } from "./instances";

export const LaunchApi = {
    launch: async (instance: Instance, authProfile: any) => {
        const result = await window.ipcRenderer.invoke('game:launch',
            instance.id,
            instance.launchVersionId || instance.version,
            authProfile
        );
        return result;
    }
};
