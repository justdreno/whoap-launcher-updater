import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Instance } from './InstanceManager';
import { ipcMain } from 'electron';

// Reusing credentials from src/lib/supabase.ts
// Ideally these should be in .env but for MVP consistency we match existing codebase
const SUPABASE_URL = 'https://ibtctzkqzezrtcglicjf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlidGN0emtxemV6cnRjZ2xpY2pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzNjg3OTksImV4cCI6MjA4Mzk0NDc5OX0.aLmdhQAzc-Rp7ynaschWNEnHDK1TMmeweBj2l4LuIvY';

export class CloudManager {
    public supabase: SupabaseClient;

    constructor() {
        this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.registerListeners();
    }

    static instance: CloudManager;
    static getInstance() {
        if (!CloudManager.instance) CloudManager.instance = new CloudManager();
        return CloudManager.instance;
    }

    private registerListeners() {
        ipcMain.handle('cloud:sync-instance', async (_, instance: Instance, userId: string) => {
            return await this.syncInstance(instance, userId);
        });

        ipcMain.handle('cloud:delete-instance', async (_, instanceName: string, userId: string) => {
            return await this.deleteInstance(instanceName, userId);
        });

        // Lookup Yashin user by username (for multiplayer skin visibility)
        ipcMain.handle('cloud:lookup-yashin-user', async (_, username: string) => {
            return await this.lookupYashinUser(username);
        });

        // Lookup multiple Yashin users by usernames
        ipcMain.handle('cloud:lookup-yashin-users', async (_, usernames: string[]) => {
            return await this.lookupYashinUsers(usernames);
        });

        // Register a player for skin visibility on multiplayer servers
        ipcMain.handle('cloud:register-multiplayer-player', async (_, playerData: { uuid: string; name: string }) => {
            return await this.registerMultiplayerPlayer(playerData.uuid, playerData.name);
        });
    }

    // Look up a Yashin user by username and register them for skin visibility
    async lookupYashinUser(username: string): Promise<{ success: boolean; user?: { uuid: string; name: string }; error?: string }> {
        try {
            const { data, error } = await this.supabase
                .from('profiles')
                .select('id, username')
                .ilike('username', username)
                .limit(1)
                .single();

            if (error || !data) {
                return { success: false, error: 'User not found' };
            }



            return { success: true, user: { uuid: data.id, name: data.username } };
        } catch (e) {
            console.error('[Cloud] Failed to lookup Yashin user:', e);
            return { success: false, error: String(e) };
        }
    }

    // Look up multiple Yashin users by usernames
    async lookupYashinUsers(usernames: string[]): Promise<{ success: boolean; users: { uuid: string; name: string }[]; error?: string }> {
        try {
            if (!usernames || usernames.length === 0) {
                return { success: true, users: [] };
            }

            // Limit to 50 users per request for performance
            const limitedUsernames = usernames.slice(0, 50);

            const { data, error } = await this.supabase
                .from('profiles')
                .select('id, username')
                .in('username', limitedUsernames);

            if (error) {
                return { success: false, users: [], error: error.message };
            }

            const users = (data || []).map(user => {

                return { uuid: user.id, name: user.username };
            });

            console.log(`[Cloud] Found ${users.length} Yashin users out of ${limitedUsernames.length} requested`);
            return { success: true, users };
        } catch (e) {
            console.error('[Cloud] Failed to lookup Yashin users:', e);
            return { success: false, users: [], error: String(e) };
        }
    }

    // Register a multiplayer player for skin visibility (checks if they're a Yashin user)
    async registerMultiplayerPlayer(uuid: string, username: string): Promise<{ success: boolean; isYashinUser: boolean; error?: string }> {
        try {
            // First check if this is a Yashin user
            const { data, error } = await this.supabase
                .from('profiles')
                .select('id, username')
                .or(`id.eq.${uuid},username.ilike.${username}`)
                .limit(1)
                .single();

            if (data) {
                console.log(`[Cloud] ✓ Registered Yashin user: ${username} (${data.id})`);
                return { success: true, isYashinUser: true };
            } else {
                // Not a Yashin user - still register them but without Yashin skin
                console.log(`[Cloud] Registered non-Yashin player: ${username}`);
                return { success: true, isYashinUser: false };
            }
        } catch (e) {
            console.error('[Cloud] Failed to register multiplayer player:', e);
            return { success: false, isYashinUser: false, error: String(e) };
        }
    }

    async deleteInstance(instanceName: string, userId: string) {
        console.log(`[Cloud] Deleting instance ${instanceName}...`);
        try {
            // Find all instances with this name for this user (there might be multiple if data is inconsistent)
            const { data: existingInstances, error: fetchError } = await this.supabase
                .from('instances')
                .select('id')
                .eq('user_id', userId)
                .eq('name', instanceName);

            if (fetchError) {
                console.error("[Cloud] Error fetching instance for delete:", fetchError);
                return { success: false, error: fetchError.message };
            }

            if (!existingInstances || existingInstances.length === 0) {
                console.log(`[Cloud] Instance ${instanceName} not found in cloud, nothing to delete`);
                return { success: true, message: 'Instance not found in cloud' };
            }

            // Delete all matching instances (in case of duplicates)
            for (const instance of existingInstances) {
                const { error: deleteError } = await this.supabase
                    .from('instances')
                    .delete()
                    .eq('id', instance.id);

                if (deleteError) {
                    console.error(`[Cloud] Failed to delete instance ${instance.id}:`, deleteError);
                    return { success: false, error: deleteError.message };
                }
            }

            console.log(`[Cloud] Successfully deleted ${existingInstances.length} instance(s) named ${instanceName}`);
            return { success: true, deletedCount: existingInstances.length };
        } catch (error) {
            console.error("[Cloud] Delete failed:", error);
            return { success: false, error: String(error) };
        }
    }

    async syncInstance(instance: Instance, userId: string, accessToken?: string) {
        console.log(`[Cloud] Syncing instance ${instance.name}...`);

        try {
            // RLS requires authenticated user.
            // If we have an accessToken (Supabase JWT), we can set it.
            // Note: 'authData.token' from Minecraft Auth is a Mojang token, NOT Supabase.
            // We need the Supabase session token.
            // LaunchProcess receives 'authData' which currently only has Mojang info.
            // We need to ensure we are passing the YASHIN/Supabase token if logged in.
            // If the user is Offline or Mojang-only, they might NOT have a Supabase token.
            // In that case, we can't sync to "instances" table protected by RLS.
            // We should check if we have a supabase token.

            // 1. Set Session if provided (Scope issue: singleton client)
            // Ideally we create a temporary client for this request context if we want to be safe,
            // or we assume single-user desktop app.

            // Wait, if authData.token is Mojang token, where is Supabase token?
            // Sidebar.tsx -> App.tsx -> User state has 'token'? 
            // When we login with Supabase, we get session.access_token.
            // When we launch, we pass 'authData' which LaunchProcess uses.
            // We need to verify what 'authData' is passed from frontend.
            // In Home.tsx: window.ipcRenderer.invoke('game:launch', ... user)
            // 'user' object in App.tsx: { name, uuid, token, type? }
            // If type is 'supabase', token is supabase token. 
            // If type is 'offline', no token.

            if (!accessToken) {
                console.warn("[Cloud] No access token provided for sync. Skipping.");
                return { success: false, error: "No auth token" };
            }

            // Set the token for this request
            const { error: authError } = await this.supabase.auth.setSession({
                access_token: accessToken,
                refresh_token: '' // Not needed for single request usually if valid
            });

            if (authError) {
                // Fallback: maybe just use global headers if setSession fails without refresh token
                // Or create a client with the token header directly?
                // Let's try attempting the op.
            }

            const { data: existing } = await this.supabase
                .from('instances')
                .select('id')
                .eq('user_id', userId)
                .eq('name', instance.name)
                .single();

            const payload = {
                user_id: userId,
                name: instance.name,
                version: instance.version,
                loader: instance.loader || 'vanilla',
                is_favorite: instance.isFavorite || false,
                updated_at: new Date().toISOString()
            };

            if (existing) {
                const { error } = await this.supabase.from('instances').update(payload).eq('id', existing.id);
                if (error) throw error;
            } else {
                const { error } = await this.supabase.from('instances').insert(payload);
                if (error) throw error;
            }

            return { success: true };
        } catch (error) {
            console.error("[Cloud] Sync failed:", error);
            return { success: false, error: String(error) };
        }
    }
}
