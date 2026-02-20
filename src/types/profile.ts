export interface PublicProfile {
    id: string;
    username: string;
    skin_url: string | null;
    cape_url: string | null;
    bio: string;
    social_links: {
        youtube?: string;
        discord?: string;
        twitter?: string;
        github?: string;
    };
    skin_history: SkinHistoryEntry[];
    joined_at: string;
    role?: string;
    is_public?: boolean;
    banner_url?: string;
    updated_at?: string;
}

export interface SkinHistoryEntry {
    url: string;
    uploaded_at: string;
    name?: string;
}

export interface SocialLinks {
    youtube: string;
    discord: string;
    twitter: string;
    github: string;
}

export const emptySocialLinks: SocialLinks = {
    youtube: '',
    discord: '',
    twitter: '',
    github: ''
};
