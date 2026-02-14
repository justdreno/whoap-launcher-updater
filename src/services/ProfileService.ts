import { supabase } from '../lib/supabase';

export interface UserProfile {
    id: string;
    username: string;
    email?: string;
    role: 'user' | 'admin' | 'developer';
    avatar_url?: string;
    preferred_skin?: string;
    preferred_cape?: string;
    joined_at?: string;
    banned?: boolean;
    ban_reason?: string;
}

export interface Badge {
    id: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    granted_at?: string;
}

export const ProfileService = {
    /**
     * Fetch user profile from database
     */
    async getProfile(userId: string): Promise<UserProfile | null> {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) {
            console.error('[ProfileService] Failed to fetch profile:', error);
            return null;
        }

        return data as UserProfile;
    },

    /**
     * Fetch user's badges
     */
    async getUserBadges(userId: string): Promise<Badge[]> {
        const { data, error } = await supabase
            .from('user_badges')
            .select(`
                granted_at,
                badge:badges(id, name, description, icon, color)
            `)
            .eq('user_id', userId);

        if (error) {
            console.error('[ProfileService] Failed to fetch badges:', error);
            return [];
        }

        return (data || []).map((row: any) => ({
            ...row.badge,
            granted_at: row.granted_at
        }));
    },

    /**
     * Check if user is an admin or developer
     */
    async isAdmin(userId: string): Promise<boolean> {
        const profile = await this.getProfile(userId);
        return profile?.role === 'admin' || profile?.role === 'developer';
    },

    /**
     * Get user role
     */
    async getRole(userId: string): Promise<string> {
        const profile = await this.getProfile(userId);
        return profile?.role || 'user';
    },

    /**
     * Update user profile
     */
    async updateProfile(userId: string, data: Partial<UserProfile>): Promise<boolean> {
        const { error } = await supabase
            .from('profiles')
            .update(data)
            .eq('id', userId);

        if (error) {
            console.error('[ProfileService] Failed to update profile:', error);
            return false;
        }
        return true;
    },

    /**
     * Get all users (admin only)
     */
    async getAllUsers(): Promise<UserProfile[]> {
        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .order('joined_at', { ascending: false });

        if (error) {
            console.error('[ProfileService] Failed to fetch users:', error);
            return [];
        }

        return data as UserProfile[];
    },

    /**
     * Ban/Unban user (admin only)
     */
    async setUserBan(userId: string, banned: boolean, reason?: string): Promise<boolean> {
        const { error } = await supabase
            .from('profiles')
            .update({ banned, ban_reason: reason || null })
            .eq('id', userId);

        if (error) {
            console.error('[ProfileService] Failed to ban user:', error);
            return false;
        }
        return true;
    },

    /**
     * Change user role (admin only)
     */
    async setUserRole(userId: string, role: 'user' | 'admin' | 'developer'): Promise<boolean> {
        const { error } = await supabase
            .from('profiles')
            .update({ role })
            .eq('id', userId);

        if (error) {
            console.error('[ProfileService] Failed to set role:', error);
            return false;
        }
        return true;
    },

    /**
     * Grant badge to user (admin only)
     */
    async grantBadge(userId: string, badgeId: string, grantedBy: string): Promise<boolean> {
        const { error } = await supabase
            .from('user_badges')
            .insert({
                user_id: userId,
                badge_id: badgeId,
                granted_by: grantedBy
            });

        if (error) {
            console.error('[ProfileService] Failed to grant badge:', error);
            return false;
        }
        return true;
    },

    /**
     * Revoke badge from user (admin only)
     */
    async revokeBadge(userId: string, badgeId: string): Promise<boolean> {
        const { error } = await supabase
            .from('user_badges')
            .delete()
            .match({ user_id: userId, badge_id: badgeId });

        if (error) {
            console.error('[ProfileService] Failed to revoke badge:', error);
            return false;
        }
        return true;
    },

    /**
     * Get all available badges
     */
    async getAllBadges(): Promise<Badge[]> {
        const { data, error } = await supabase
            .from('badges')
            .select('*')
            .order('name');

        if (error) {
            console.error('[ProfileService] Failed to fetch badges:', error);
            return [];
        }

        return data as Badge[];
    },

    /**
     * Create a new badge (admin only)
     */
    async createBadge(badge: Omit<Badge, 'id'>): Promise<Badge | null> {
        const { data, error } = await supabase
            .from('badges')
            .insert(badge)
            .select()
            .single();

        if (error) {
            console.error('[ProfileService] Failed to create badge:', error);
            return null;
        }

        return data as Badge;
    }
};
