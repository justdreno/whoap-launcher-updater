import { supabase } from '../lib/supabase';

export interface NewsItem {
    id: string;
    title: string;
    content: string;
    image_url: string;
    color?: string;
    link_url?: string;
    date: string;
    source?: 'yashin' | 'minecraft';
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

export interface CacheMetadata {
    timestamp: number;
    expiresAt: number;
    version: string;
}

interface CachedData<T> {
    data: T[];
    metadata: CacheMetadata;
}

const CACHE_KEYS = {
    news: 'yashin_news_cache',
    changelogs: 'yashin_changelogs_cache',
    minecraftNews: 'minecraft_news_cache',
};

const CACHE_VERSION = '1.0';
const DEFAULT_CACHE_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days

function saveToCache<T>(key: string, data: T[], durationMs: number = DEFAULT_CACHE_DURATION): void {
    try {
        const cached: CachedData<T> = {
            data,
            metadata: {
                timestamp: Date.now(),
                expiresAt: Date.now() + durationMs,
                version: CACHE_VERSION
            }
        };
        localStorage.setItem(key, JSON.stringify(cached));
    } catch (e) {
        console.warn('[ContentManager] Failed to save cache:', e);
    }
}

function loadFromCache<T>(key: string): { data: T[]; fromCache: boolean; age: number; expired: boolean } | null {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        const cached: CachedData<T> = JSON.parse(raw);
        if (!cached.data || !Array.isArray(cached.data)) return null;
        if (cached.metadata?.version !== CACHE_VERSION) return null;

        const now = Date.now();
        const expired = now > cached.metadata.expiresAt;
        const age = now - cached.metadata.timestamp;

        return {
            data: cached.data,
            fromCache: true,
            age,
            expired
        };
    } catch {
        return null;
    }
}

function formatCacheAge(ageMs: number): string {
    const seconds = Math.floor(ageMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
}

export const ContentManager = {
    fetchNews: async (forceRefresh: boolean = false): Promise<{
        items: NewsItem[];
        fromCache: boolean;
        cacheAge?: string;
    }> => {
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
            const cached = loadFromCache<NewsItem>(CACHE_KEYS.news);
            if (cached && !cached.expired) {
                return {
                    items: cached.data,
                    fromCache: true,
                    cacheAge: formatCacheAge(cached.age)
                };
            }
        }

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
            // Fallback to cache (even if expired)
            const cached = loadFromCache<NewsItem>(CACHE_KEYS.news);
            if (cached) {
                return {
                    items: cached.data,
                    fromCache: true,
                    cacheAge: formatCacheAge(cached.age) + ' (expired)'
                };
            }
            return { items: [], fromCache: false };
        }
    },

    fetchChangelogs: async (forceRefresh: boolean = false): Promise<{
        items: ChangelogItem[];
        fromCache: boolean;
        cacheAge?: string;
    }> => {
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
            const cached = loadFromCache<ChangelogItem>(CACHE_KEYS.changelogs);
            if (cached && !cached.expired) {
                return {
                    items: cached.data,
                    fromCache: true,
                    cacheAge: formatCacheAge(cached.age)
                };
            }
        }

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
                return {
                    items: cached.data,
                    fromCache: true,
                    cacheAge: formatCacheAge(cached.age) + ' (expired)'
                };
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

        // Clear cache after creating new changelog
        ContentManager.clearCache('changelogs');

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

        // Clear cache after deleting
        ContentManager.clearCache('changelogs');
        return true;
    },

    fetchMinecraftNews: async (forceRefresh: boolean = false): Promise<{
        items: NewsItem[];
        fromCache: boolean;
        cacheAge?: string;
    }> => {
        // Check cache first if not forcing refresh
        if (!forceRefresh) {
            const cached = loadFromCache<NewsItem>(CACHE_KEYS.minecraftNews);
            if (cached && !cached.expired) {
                return {
                    items: cached.data,
                    fromCache: true,
                    cacheAge: formatCacheAge(cached.age)
                };
            }
        }

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
            // Fallback to cache (even if expired)
            const cached = loadFromCache<NewsItem>(CACHE_KEYS.minecraftNews);
            if (cached) {
                return {
                    items: cached.data,
                    fromCache: true,
                    cacheAge: formatCacheAge(cached.age) + ' (expired)'
                };
            }
            return { items: [], fromCache: false };
        }
    },

    // Clear specific cache
    clearCache: (type: 'news' | 'changelogs' | 'minecraft' | 'all'): void => {
        try {
            if (type === 'all' || type === 'news') {
                localStorage.removeItem(CACHE_KEYS.news);
            }
            if (type === 'all' || type === 'changelogs') {
                localStorage.removeItem(CACHE_KEYS.changelogs);
            }
            if (type === 'all' || type === 'minecraft') {
                localStorage.removeItem(CACHE_KEYS.minecraftNews);
            }
        } catch (e) {
            console.warn('[ContentManager] Failed to clear cache:', e);
        }
    },

    // Get cache status
    getCacheStatus: (): {
        news: { hasCache: boolean; age?: string; expired?: boolean };
        changelogs: { hasCache: boolean; age?: string; expired?: boolean };
        minecraftNews: { hasCache: boolean; age?: string; expired?: boolean };
    } => {
        const newsCache = loadFromCache<NewsItem>(CACHE_KEYS.news);
        const changelogsCache = loadFromCache<ChangelogItem>(CACHE_KEYS.changelogs);
        const minecraftCache = loadFromCache<NewsItem>(CACHE_KEYS.minecraftNews);

        return {
            news: {
                hasCache: !!newsCache,
                age: newsCache ? formatCacheAge(newsCache.age) : undefined,
                expired: newsCache?.expired
            },
            changelogs: {
                hasCache: !!changelogsCache,
                age: changelogsCache ? formatCacheAge(changelogsCache.age) : undefined,
                expired: changelogsCache?.expired
            },
            minecraftNews: {
                hasCache: !!minecraftCache,
                age: minecraftCache ? formatCacheAge(minecraftCache.age) : undefined,
                expired: minecraftCache?.expired
            }
        };
    }
};
