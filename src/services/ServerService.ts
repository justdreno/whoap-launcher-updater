import { supabase } from '../lib/supabase';

export interface FeaturedServer {
    id: string;
    name: string;
    address: string;
    icon_url?: string;
    banner_url?: string;
    description?: string;
    rank?: number;
    created_at: string;
}

export const ServerService = {
    /**
     * Fetch all featured servers
     */
    async getFeaturedServers(): Promise<FeaturedServer[]> {
        const { data, error } = await supabase
            .from('featured_servers')
            .select('*')
            .order('rank', { ascending: true })
            .order('created_at', { ascending: false });

        if (error) {
            console.error('[ServerService] Failed to fetch servers:', error);
            return [];
        }

        return data as FeaturedServer[];
    },

    /**
     * Add a new featured server
     */
    async addServer(server: Omit<FeaturedServer, 'id' | 'created_at' | 'rank'>): Promise<FeaturedServer | null> {
        // Get max rank
        const { data: maxRankData } = await supabase
            .from('featured_servers')
            .select('rank')
            .order('rank', { ascending: false })
            .limit(1)
            .single();

        const nextRank = (maxRankData?.rank || 0) + 1;

        const { data, error } = await supabase
            .from('featured_servers')
            .insert({ ...server, rank: nextRank })
            .select()
            .single();

        if (error) {
            console.error('[ServerService] Failed to add server:', error);
            return null;
        }

        return data as FeaturedServer;
    },

    /**
     * Update an existing featured server
     */
    async updateServer(id: string, updates: Partial<FeaturedServer>): Promise<boolean> {
        const { error } = await supabase
            .from('featured_servers')
            .update(updates)
            .eq('id', id);

        if (error) {
            console.error('[ServerService] Failed to update server:', error);
            return false;
        }
        return true;
    },

    /**
     * Reorder servers
     */
    async reorderServers(orderedIds: string[]): Promise<boolean> {
        const updates = orderedIds.map((id, index) =>
            supabase.from('featured_servers').update({ rank: index }).eq('id', id)
        );

        try {
            await Promise.all(updates);
            return true;
        } catch (e) {
            console.error('[ServerService] Failed to reorder servers:', e);
            return false;
        }
    },

    /**
     * Delete a featured server
     */
    async deleteServer(id: string): Promise<boolean> {
        const { error } = await supabase
            .from('featured_servers')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('[ServerService] Failed to delete server:', error);
            return false;
        }
        return true;
    }
};
