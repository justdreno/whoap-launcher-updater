import { supabase } from '../lib/supabase';

export interface NewsItem {
    id: string;
    title: string;
    content: string;
    image_url: string;
    color?: string;
    link_url?: string;
    date: string;
    source?: 'whoap' | 'minecraft';
}

export interface MinecraftNewsItem {
    id: string;
    title: string;
    text: string;
    image?: {
        url: string;
    };
    readMoreLink?: string;
    date: string;
}

export interface ChangelogItem {
    id: string;
    version: string;
    description: string;
    type: 'release' | 'beta' | 'hotfix';
    date: string;
}

interface CachedData<T> {
    data: T[];
    timestamp: number;
}

const CACHE_KEYS = {
    news: 'whoap_news_cache',
    changelogs: 'whoap_changelogs_cache',
    minecraftNews: 'minecraft_news_cache',
};

function saveToCache<T>(key: string, data: T[]): void {
    try {
        const cached: CachedData<T> = { data, timestamp: Date.now() };
        localStorage.setItem(key, JSON.stringify(cached));
    } catch (e) {
        console.warn('[ContentManager] Failed to save cache:', e);
    }
}

function loadFromCache<T>(key: string): { data: T[]; fromCache: boolean; age: number } | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const cached: CachedData<T> = JSON.parse(raw);
        if (!cached.data || !Array.isArray(cached.data)) return null;
        return { data: cached.data, fromCache: true, age: Date.now() - cached.timestamp };
    } catch {
        return null;
    }
}

export const ContentManager = {
    fetchNews: async (): Promise<{ items: NewsItem[]; fromCache: boolean }> => {
        try {
            const { data, error } = await supabase
                .from('news')
                .select('*')
                .or(`published.eq.true,published.is.null`)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;

            const items: NewsItem[] = data.map((row: any) => ({
                id: row.id,
                title: row.title,
                content: row.content,
                image_url: row.image_url,
                color: row.color,
                link_url: row.link_url,
                date: row.created_at
            }));

            // Cache successful fetch
            saveToCache(CACHE_KEYS.news, items);
            return { items, fromCache: false };
        } catch (e) {
            console.error("[ContentManager] News fetch failed, trying cache:", e);
            // Fallback to cache
            const cached = loadFromCache<NewsItem>(CACHE_KEYS.news);
            if (cached) {
                return { items: cached.data, fromCache: true };
            }
            return { items: [], fromCache: false };
        }
    },

    fetchChangelogs: async (): Promise<{ items: ChangelogItem[]; fromCache: boolean }> => {
        try {
            const { data, error } = await supabase
                .from('changelogs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;

            const items: ChangelogItem[] = data.map((row: any) => ({
                id: row.id,
                version: row.version,
                description: row.description,
                type: row.type,
                date: row.created_at
            }));

            // Cache successful fetch
            saveToCache(CACHE_KEYS.changelogs, items);
            return { items, fromCache: false };
        } catch (e) {
            console.error("[ContentManager] Changelog fetch failed, trying cache:", e);
            const cached = loadFromCache<ChangelogItem>(CACHE_KEYS.changelogs);
            if (cached) {
                return { items: cached.data, fromCache: true };
            }
            return { items: [], fromCache: false };
        }
    },

    createChangelog: async (changelog: Omit<ChangelogItem, 'id' | 'date'>): Promise<ChangelogItem | null> => {
        const { data, error } = await supabase
            .from('changelogs')
            .insert({
                version: changelog.version,
                description: changelog.description,
                type: changelog.type
            })
            .select()
            .single();

        if (error) {
            console.error("Changelog Creation Error:", error);
            return null;
        }

        return {
            id: data.id,
            version: data.version,
            description: data.description,
            type: data.type,
            date: data.created_at
        };
    },

    deleteChangelog: async (id: string): Promise<boolean> => {
        const { error } = await supabase
            .from('changelogs')
            .delete()
            .eq('id', id);

        if (error) {
            console.error("Changelog Deletion Error:", error);
            return false;
        }

        return true;
    },

    fetchMinecraftNews: async (): Promise<{ items: NewsItem[]; fromCache: boolean }> => {
        try {
            const response = await fetch('https://launchercontent.mojang.com/news.json');
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const data = await response.json();
            
            const items: NewsItem[] = (data.entries || []).slice(0, 10).map((entry: any, index: number) => {
                // Get image URL - prefer newsPageImage, fallback to playPageImage
                let imageUrl = '';
                if (entry.newsPageImage?.url) {
                    imageUrl = entry.newsPageImage.url.startsWith('http') 
                        ? entry.newsPageImage.url 
                        : `https://launchercontent.mojang.com${entry.newsPageImage.url}`;
                } else if (entry.playPageImage?.url) {
                    imageUrl = entry.playPageImage.url.startsWith('http') 
                        ? entry.playPageImage.url 
                        : `https://launchercontent.mojang.com${entry.playPageImage.url}`;
                }
                
                return {
                    id: `mc_${entry.id || index}`,
                    title: entry.title || 'Untitled',
                    content: entry.text || '',
                    image_url: imageUrl,
                    link_url: entry.readMoreLink || '',
                    date: entry.date || new Date().toISOString(),
                    source: 'minecraft' as const,
                    color: '#52A535' // Minecraft green
                };
            });

            // Cache successful fetch
            saveToCache(CACHE_KEYS.minecraftNews, items);
            return { items, fromCache: false };
        } catch (e) {
            console.error("[ContentManager] Minecraft news fetch failed, trying cache:", e);
            // Fallback to cache
            const cached = loadFromCache<NewsItem>(CACHE_KEYS.minecraftNews);
            if (cached) {
                return { items: cached.data, fromCache: true };
            }
            return { items: [], fromCache: false };
        }
    }
};
