import { supabase } from '../lib/supabase';
import { Instance } from '../api/instances';

export const CloudManager = {
    /**
     * uploads a single instance to the cloud
     */
    saveInstance: async (instance: Instance, userId: string) => {
        if (!userId) return;

        const { error } = await supabase
            .from('instances')
            .upsert({
                user_id: userId,
                name: instance.name,
                version: instance.version,
                loader: instance.loader,
                icon: instance.icon,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id, name' }); // simplistic de-dupe strategy

        if (error) {
            console.error("Cloud Save Error:", error);
            return false;
        }
        return true;
    },

    /**
     * Fetches all instances for the current user from the cloud
     */
    fetchInstances: async (userId: string): Promise<Instance[]> => {
        if (!userId) return [];

        const { data, error } = await supabase
            .from('instances')
            .select('*')
            .eq('user_id', userId);

        if (error) {
            console.error("Cloud Fetch Error:", error);
            return [];
        }

        return data.map((row: any) => ({
            id: row.id,
            name: row.name,
            version: row.version,
            loader: row.loader,
            icon: row.icon,
            created: new Date(row.created_at).getTime(),
            lastPlayed: 0
        }));
    },

    /**
     * Deletes an instance from the cloud
     */
    deleteInstance: async (instanceName: string, userId: string) => {
        if (!userId) return;

        const { error } = await supabase
            .from('instances')
            .delete()
            .match({ user_id: userId, name: instanceName });

        if (error) console.error("Cloud Delete Error:", error);
    },

    /**
     * Settings Sync
     * We only sync portable preferences (RAM, Launch Behavior).
     * We DO NOT sync paths (gamePath, javaPaths, instancesPath) as they are device specific.
     */
    saveSettings: async (settings: any, userId: string) => {
        if (!userId) return;

        // Filter syncable settings
        const syncable = {
            minRam: settings.minRam,
            maxRam: settings.maxRam,
            launchBehavior: settings.launchBehavior,
            showConsoleOnLaunch: settings.showConsoleOnLaunch,
            updated_at: new Date().toISOString()
        };

        const { error } = await supabase
            .from('settings')
            .upsert({
                user_id: userId,
                ...syncable
            }, { onConflict: 'user_id' });

        if (error) {
            console.error("Cloud Save Settings Error:", error);
            return false;
        }
        return true;
    },

    fetchSettings: async (userId: string): Promise<any | null> => {
        if (!userId) return null;

        const { data, error } = await supabase
            .from('settings')
            .select('*')
            .eq('user_id', userId)
            .single();

        if (error) {
            if (error.code !== 'PGRST116') {
                console.error("Cloud Fetch Settings Error:", error);
            }
            return null;
        }

        if (!data) return null;

        return {
            minRam: data.minRam,
            maxRam: data.maxRam,
            launchBehavior: data.launchBehavior,
            showConsoleOnLaunch: data.showConsoleOnLaunch
        };
    },

    // --- Friends System ---

    async syncSession(token: string, refreshToken?: string): Promise<{ success: boolean; session?: any }> {
        // 1. Attempt to restore session
        const { error } = await supabase.auth.setSession({
            access_token: token,
            refresh_token: refreshToken || ''
        });

        // 2. Verify the session is actually active
        const { data: { session: verifiedSession }, error: verificationError } = await supabase.auth.getSession();

        // If setSession failed OR verification says no/invalid session
        if (error || verificationError || !verifiedSession) {
            console.warn("[CloudManager] Session restore failed or invalid. Attempting refresh...", error || verificationError);

            if (refreshToken) {
                const { data, error: refreshError } = await supabase.auth.refreshSession({
                    refresh_token: refreshToken
                });

                if (!refreshError && data.session) {
                    console.log("[CloudManager] Session refreshed successfully via fallback");
                    return { success: true, session: data.session };
                }
                console.error("[CloudManager] Session refresh failed:", refreshError);
            }
            return { success: false };
        }

        console.log("[CloudManager] Session restored and verified successfully");
        return { success: true };
    },

    searchUsers: async (query: string) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, username, avatar_url')
            .ilike('username', `%${query}%`)
            .limit(10);

        if (error) {
            console.error("Search Users Error:", error);
            return [];
        }
        return data || [];
    },

    checkUsernameExists: async (username: string) => {
        const { data, error } = await supabase
            .from('profiles')
            .select('username')
            .ilike('username', username)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
            console.error("Check Username Error:", error);
            return false;
        }
        return !!data;
    },

    sendFriendRequest: async (senderId: string, receiverId: string) => {
        const { error } = await supabase
            .from('friendships')
            .insert({
                requester_id: senderId,
                receiver_id: receiverId,
                status: 'pending'
            });

        if (error) {
            console.error("Send Request Error:", error);
            return false;
        }
        return true;
    },

    acceptFriendRequest: async (requestId: string) => {
        const { error } = await supabase
            .from('friendships')
            .update({ status: 'accepted' })
            .eq('id', requestId);

        if (error) {
            console.error("Accept Request Error:", error);
            return false;
        }
        return true;
    },

    removeFriend: async (userId: string, friendId: string) => {
        const { error } = await supabase
            .from('friendships')
            .delete()
            .or(`and(requester_id.eq.${userId},receiver_id.eq.${friendId}),and(requester_id.eq.${friendId},receiver_id.eq.${userId})`);

        if (error) {
            console.error("Remove Friend Error:", error);
            return false;
        }
        return true;
    },

    getFriendRequests: async (userId: string) => {
        const { data, error } = await supabase
            .from('friendships')
            .select(`
                id,
                created_at,
                sender:profiles!requester_id(id, username, avatar_url)
            `)
            .eq('receiver_id', userId)
            .eq('status', 'pending');

        if (error) {
            console.error("Get Requests Error:", error);
            return [];
        }

        return (data || []).map((row: any) => ({
            ...row,
            sender: Array.isArray(row.sender) ? row.sender[0] : row.sender
        }));
    },

    getFriends: async (userId: string) => {
        // Log to terminal via IPC
        const log = (msg: string) => window.ipcRenderer?.send('log-to-terminal', msg);

        log(`!!! CloudManager.getFriends called with userId: ${userId}`);
        const { data: sessionData } = await supabase.auth.getSession();
        log(`!!! CloudManager Session User: ${sessionData.session?.user?.id}`);

        const { data, error } = await supabase
            .from('friendships')
            .select(`
                requester:profiles!requester_id(id, username, avatar_url),
                receiver:profiles!receiver_id(id, username, avatar_url)
            `)
            .or(`requester_id.eq.${userId},receiver_id.eq.${userId}`)
            .eq('status', 'accepted');

        if (error) {
            log(`!!! CloudManager Get Friends Error: ${JSON.stringify(error)}`);
            return [];
        }
        log(`!!! CloudManager Friends Data Count: ${data?.length}`);

        return (data || []).map((f: any) => {
            const requester = Array.isArray(f.requester) ? f.requester[0] : f.requester;
            const receiver = Array.isArray(f.receiver) ? f.receiver[0] : f.receiver;

            if (!requester || !receiver) return null;
            return requester.id === userId ? receiver : requester;
        }).filter(Boolean);
    },

    // --- Shared Instances System ---

    shareInstance: async (senderId: string, receiverId: string, instanceData: any) => {
        const { error } = await supabase
            .from('shared_instances')
            .insert({
                sender_id: senderId,
                receiver_id: receiverId,
                instance_data: instanceData,
                status: 'pending'
            });

        if (error) {
            console.error("[CloudManager] Share Instance Failed:", error);
            return false;
        }
        return true;
    },

    getSharedInstances: async (userId: string) => {
        const { data, error } = await supabase
            .from('shared_instances')
            .select(`
                *,
                sender:sender_id(username, id)
            `)
            .eq('receiver_id', userId)
            .eq('status', 'pending');

        if (error) {
            console.error("[CloudManager] Get Shared Instances Failed:", error);
            return [];
        }
        return data;
    },

    acceptSharedInstance: async (shareId: string) => {
        const { error } = await supabase
            .from('shared_instances')
            .update({ status: 'accepted' })
            .eq('id', shareId);

        if (error) {
            console.error("[CloudManager] Accept Shared Instance Failed:", error);
            return false;
        }
        return true;
    }
};
