import { supabase } from '../lib/supabase';
import { Instance } from '../api/instances';
import { PublicProfile, SkinHistoryEntry } from '../types/profile';

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

    // --- Session Management ---

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

    // --- Skin/Cape Cloud Storage ---

    async uploadSkinToCloud(userId: string, skinData: string): Promise<string | null> {
        try {
            const fileName = `${userId}/skin_${Date.now()}.png`;

            const response = await fetch(skinData);
            const blob = await response.blob();

            const { error } = await supabase.storage
                .from('yashin-skins')
                .upload(fileName, blob, {
                    upsert: true,
                    contentType: 'image/png'
                });

            if (error) {
                console.error('[CloudManager] Upload skin failed:', error);
                return null;
            }

            const { data: urlData } = supabase.storage
                .from('yashin-skins')
                .getPublicUrl(fileName);

            await supabase
                .from('profiles')
                .update({
                    skin_url: urlData.publicUrl,
                    updated_at: new Date().toISOString()
                })
                .eq('id', userId);

            await CloudManager.addSkinToHistory(userId, urlData.publicUrl);

            return urlData.publicUrl;
        } catch (error) {
            console.error('[CloudManager] Upload skin error:', error);
            return null;
        }
    },

    async uploadCapeToCloud(userId: string, capeData: string): Promise<string | null> {
        try {
            const fileName = `${userId}/cape_${Date.now()}.png`;

            const response = await fetch(capeData);
            const blob = await response.blob();

            const { error } = await supabase.storage
                .from('yashin-skins')
                .upload(fileName, blob, {
                    upsert: true,
                    contentType: 'image/png'
                });

            if (error) {
                console.error('[CloudManager] Upload cape failed:', error);
                return null;
            }

            const { data: urlData } = supabase.storage
                .from('yashin-skins')
                .getPublicUrl(fileName);

            await supabase
                .from('profiles')
                .update({ cape_url: urlData.publicUrl })
                .eq('id', userId);

            return urlData.publicUrl;
        } catch (error) {
            console.error('[CloudManager] Upload cape error:', error);
            return null;
        }
    },

    async addSkinToHistory(userId: string, skinUrl: string): Promise<void> {
        try {
            const { data } = await supabase
                .from('profiles')
                .select('skin_history')
                .eq('id', userId)
                .single();

            const history: SkinHistoryEntry[] = data?.skin_history || [];

            // Check if this skin URL already exists in history
            const alreadyExists = history.some(entry => entry.url === skinUrl);
            if (alreadyExists) {
                return; // Don't add duplicates
            }

            const newEntry: SkinHistoryEntry = {
                url: skinUrl,
                uploaded_at: new Date().toISOString()
            };
            const updatedHistory = [newEntry, ...history].slice(0, 10);

            await supabase
                .from('profiles')
                .update({ skin_history: updatedHistory })
                .eq('id', userId);
        } catch (error) {
            console.error('[CloudManager] Add skin to history error:', error);
        }
    },

    async getPublicProfile(username: string): Promise<PublicProfile | null> {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, username, skin_url, cape_url, bio, social_links, skin_history, joined_at, role, is_public, banner_url, updated_at')
                .ilike('username', username)
                .single();

            if (error) {
                console.error('[CloudManager] Get public profile failed:', error);
                return null;
            }
            return data as PublicProfile;
        } catch {
            return null;
        }
    },

    /**
     * Check if a username already exists (case-insensitive)
     */
    checkUsernameExists: async (username: string): Promise<boolean> => {
        if (!username) return false;
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id')
                .ilike('username', username)
                .limit(1);
            if (error) {
                console.error('[CloudManager] checkUsernameExists error:', error);
                return false;
            }
            return Array.isArray(data) && data.length > 0;
        } catch (err) {
            console.error('[CloudManager] checkUsernameExists exception:', err);
            return false;
        }
    },

    async getPublicProfiles(page: number = 1, limit: number = 24): Promise<PublicProfile[]> {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, username, skin_url, cape_url, joined_at, role')
                .eq('is_public', true)
                .not('skin_url', 'is', null)
                .order('updated_at', { ascending: false })
                .range((page - 1) * limit, page * limit - 1);

            if (error) return [];
            return data as PublicProfile[];
        } catch {
            return [];
        }
    },

    async searchPublicProfiles(query: string): Promise<PublicProfile[]> {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, username, skin_url, cape_url, joined_at, role')
                .eq('is_public', true)
                .not('skin_url', 'is', null)
                .ilike('username', `%${query}%`)
                .limit(24);

            if (error) return [];
            return data as PublicProfile[];
        } catch {
            return [];
        }
    },

    async updateSkinAndCape(userId: string, skinUrl: string, capeUrl?: string | null): Promise<boolean> {
        const updates: any = {
            skin_url: skinUrl,
            updated_at: new Date().toISOString()
        };
        if (capeUrl !== undefined) {
            updates.cape_url = capeUrl || null;
        }
        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId);

        if (error) {
            console.error('[CloudManager] Update skin/cape failed:', error);
            return false;
        }
        return true;
    },

    async updatePublicProfile(userId: string, updates: { bio?: string; social_links?: any; is_public?: boolean }): Promise<boolean> {
        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', userId);

        if (error) {
            console.error('[CloudManager] Update public profile failed:', error);
            return false;
        }
        return true;
    }
};
