import { supabase } from '../lib/supabase';

export interface SystemConfig {
    version: string;
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


};
