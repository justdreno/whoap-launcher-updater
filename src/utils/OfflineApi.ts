// Offline-compatible API wrapper
// All API calls should go through this wrapper for offline support

import { OfflineManager } from './OfflineManager';

interface CachedData<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
}

const CACHE_PREFIX = 'whoap_cache_';
const DEFAULT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export const OfflineApi = {
    // Generic fetch with offline support
    fetch: async <T>(
        url: string,
        options?: RequestInit,
        cacheKey?: string,
        cacheDuration: number = DEFAULT_CACHE_DURATION
    ): Promise<{ data?: T; error?: string; fromCache?: boolean }> => {
        const isOffline = OfflineManager.isOffline();
        const fullCacheKey = cacheKey ? `${CACHE_PREFIX}${cacheKey}` : null;

        // Try to fetch from network if online
        if (!isOffline) {
            try {
                const response = await fetch(url, options);
                if (response.ok) {
                    const data = await response.json();
                    
                    // Cache successful response
                    if (fullCacheKey) {
                        const cacheData: CachedData<T> = {
                            data,
                            timestamp: Date.now(),
                            expiresAt: Date.now() + cacheDuration
                        };
                        localStorage.setItem(fullCacheKey, JSON.stringify(cacheData));
                    }
                    
                    return { data, fromCache: false };
                }
            } catch (error) {
                console.warn(`[OfflineApi] Network fetch failed: ${url}`, error);
            }
        }

        // Try to get from cache
        if (fullCacheKey) {
            const cached = localStorage.getItem(fullCacheKey);
            if (cached) {
                try {
                    const parsed: CachedData<T> = JSON.parse(cached);
                    if (parsed.expiresAt > Date.now()) {
                        console.log(`[OfflineApi] Serving from cache: ${cacheKey}`);
                        return { data: parsed.data, fromCache: true };
                    }
                } catch {
                    localStorage.removeItem(fullCacheKey);
                }
            }
        }

        // No data available
        return { 
            error: isOffline ? 'You are offline' : 'Failed to fetch data',
            fromCache: false 
        };
    },

    // Clear specific cache
    clearCache: (cacheKey: string) => {
        localStorage.removeItem(`${CACHE_PREFIX}${cacheKey}`);
    },

    // Clear all cached data
    clearAllCache: () => {
        Object.keys(localStorage)
            .filter(key => key.startsWith(CACHE_PREFIX))
            .forEach(key => localStorage.removeItem(key));
    },

    // Check if data is cached and valid
    isCached: (cacheKey: string): boolean => {
        const cached = localStorage.getItem(`${CACHE_PREFIX}${cacheKey}`);
        if (!cached) return false;
        
        try {
            const parsed: CachedData<any> = JSON.parse(cached);
            return parsed.expiresAt > Date.now();
        } catch {
            return false;
        }
    }
};
