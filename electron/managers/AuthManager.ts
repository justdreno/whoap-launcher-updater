import { ipcMain } from 'electron';
import { Auth } from 'msmc';
import { SessionStore, StoredSession } from './SessionStore';

export class AuthManager {
    constructor() {
        this.registerListeners();
    }

    private registerListeners() {
        // Check for existing session on startup
        ipcMain.handle('auth:get-session', async () => {
            const session = SessionStore.get();
            if (session && SessionStore.isValid()) {
                return { success: true, profile: session };
            }
            return { success: false };
        });

        // Logout - clear session
        ipcMain.handle('auth:logout', async () => {
            SessionStore.clear();
            return { success: true };
        });

        ipcMain.handle('auth:login-microsoft', async () => {
            try {
                const authManager = new Auth("select_account");
                const xboxManager = await authManager.launch("electron");
                const token = await xboxManager.getMinecraft();

                if (!token.profile) {
                    throw new Error("Failed to fetch minecraft profile");
                }

                const session: StoredSession = {
                    type: 'microsoft',
                    name: token.profile.name,
                    uuid: token.profile.id,
                    token: token.mcToken
                };

                SessionStore.save(session);

                return {
                    success: true,
                    profile: {
                        name: token.profile.name,
                        uuid: token.profile.id,
                        token: token.mcToken,
                        type: 'microsoft' as const
                    }
                };
            } catch (error) {
                console.error("Login failed", error);
                return { success: false, error: String(error) };
            }
        });

        ipcMain.handle('auth:login-offline', async (_, username: string) => {
            const { v3: uuidv3 } = await import('uuid');
            const NAMESPACE = "00000000-0000-0000-0000-000000000000";
            const offlineUuid = uuidv3("OfflinePlayer:" + username, NAMESPACE);

            const session: StoredSession = {
                type: 'offline',
                name: username,
                uuid: offlineUuid,
                token: ''
            };

            SessionStore.save(session);

            return {
                success: true,
                profile: {
                    name: username,
                    uuid: offlineUuid,
                    token: '',
                    type: 'offline' as const
                }
            };
        });

        ipcMain.handle('auth:save-yashin-session', async (_, sessionData: { name: string; uuid: string; token: string; refreshToken?: string }) => {
            const session: StoredSession = {
                type: 'yashin',
                name: sessionData.name,
                uuid: sessionData.uuid,
                token: sessionData.token,
                refreshToken: sessionData.refreshToken,
                expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000)
            };
            SessionStore.save(session);
            return { success: true };
        });

        ipcMain.handle('auth:set-session', async (_, session: StoredSession) => {
            SessionStore.save(session);
            return { success: true };
        });

        // Update existing session (e.g. after token refresh)
        ipcMain.handle('auth:update-session', async (_, updateData: Partial<StoredSession>) => {
            const current = SessionStore.get();
            if (current) {
                const updated = { ...current, ...updateData };
                SessionStore.save(updated);
                return { success: true };
            }
            return { success: false, error: 'No active session to update' };
        });
    }
}
