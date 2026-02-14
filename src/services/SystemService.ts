import { supabase } from '../lib/supabase';

export interface SystemConfig {
    version: string;
}

export interface UpdateAnnouncement {
    id: string;
    version: string;
    download_url: string;
    button_title: string;
    message: string | null;
    priority: 'low' | 'normal' | 'high' | 'critical';
    is_active: boolean;
    created_at: string;
}

export const SystemService = {
    /**
     * Fetches the current application version from the system_config table.
     */
    getAppVersion: async (): Promise<string> => {
        try {
            const { data, error } = await supabase
                .from('system_config')
                .select('value')
                .eq('key', 'app_version')
                .single();

            if (error || !data) {
                return '1.0.0';
            }

            return (data.value as SystemConfig).version;
        } catch (err) {
            console.error('Error fetching version:', err);
            return '1.0.0';
        }
    },

    /**
     * Updates the application version in the system_config table.
     */
    updateAppVersion: async (newVersion: string, userId: string): Promise<boolean> => {
        try {
            const { error } = await supabase
                .from('system_config')
                .update({
                    value: { version: newVersion },
                    updated_by: userId,
                    updated_at: new Date().toISOString()
                })
                .eq('key', 'app_version');

            if (error) {
                console.error('Failed to update version:', error);
                return false;
            }

            return true;
        } catch (err) {
            console.error('Error updating version:', err);
            return false;
        }
    },

    /**
     * Fetch active update announcement (only 1 at a time)
     */
    getUpdateAnnouncement: async (): Promise<UpdateAnnouncement | null> => {
        try {
            const { data, error } = await supabase
                .from('update_announcements')
                .select('*')
                .eq('is_active', true)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            if (error || !data) {
                return null;
            }

            return data;
        } catch (err) {
            console.error('Failed to fetch update announcement:', err);
            return null;
        }
    },

    /**
     * Get all update announcements (admin only)
     */
    getAllUpdateAnnouncements: async (): Promise<UpdateAnnouncement[]> => {
        try {
            const { data, error } = await supabase
                .from('update_announcements')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Failed to fetch all announcements:', error);
                return [];
            }

            return data || [];
        } catch (err) {
            console.error('Error fetching announcements:', err);
            return [];
        }
    },

    /**
     * Create update announcement (admin only)
     */
    createUpdateAnnouncement: async (
        version: string,
        downloadUrl: string,
        buttonTitle: string,
        message?: string,
        priority: 'low' | 'normal' | 'high' | 'critical' = 'normal'
    ): Promise<UpdateAnnouncement | null> => {
        try {
            const { data, error } = await supabase
                .from('update_announcements')
                .insert({
                    version,
                    download_url: downloadUrl,
                    button_title: buttonTitle,
                    message: message || null,
                    priority,
                    is_active: true
                })
                .select()
                .single();

            if (error) {
                console.error('Failed to create announcement:', error);
                return null;
            }

            return data;
        } catch (err) {
            console.error('Error creating announcement:', err);
            return null;
        }
    },

    /**
     * Delete update announcement (admin only)
     */
    deleteUpdateAnnouncement: async (id: string): Promise<boolean> => {
        try {
            const { error } = await supabase
                .from('update_announcements')
                .delete()
                .eq('id', id);

            if (error) {
                console.error('Failed to delete announcement:', error);
                return false;
            }

            return true;
        } catch (err) {
            console.error('Error deleting announcement:', err);
            return false;
        }
    }
};
