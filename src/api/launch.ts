import { Instance } from "./instances";

export const LaunchApi = {
    launch: async (instance: Instance, authProfile: any) => {
        // Need to construct the absolute path? 
        // Actually, let's let the backend handle the path calculation if possible, 
        // but for now we pass what we have.
        // We need to resolve the full path. The backend knows the base path.
        // Let's pass the ID and let backend find the path.

        // Wait, the LaunchProcess handler signature I wrote is:
        // (event, instanceId, instancePath, versionId, authData)
        // I should simplify it to just instanceId and authData.

        // Actually the previous thought was to let backend find path.
        // Let's change the frontend to just pass ID and auth.
        // BUT for now, let's stick to the signature I just wrote in LaunchProcess.ts?
        // No, I can't easily get absolute path in frontend.

        // I will update LaunchProcess.ts to look up the path using InstanceManager logic (replicated or shared).
        // Since I can't easily share logic yet without refactor, I will assume a standard path in LaunchProcess.

        // This file is just the API definition.

        const result = await window.ipcRenderer.invoke('game:launch',
            instance.id,
            "", // instancePath - let backend figure it out? 
            instance.launchVersionId || instance.version,
            authProfile
        );
        return result;
    }
};
