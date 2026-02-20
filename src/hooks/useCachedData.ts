import { useState, useEffect, useCallback } from 'react';
import { useOfflineStatus } from './useOfflineStatus';

interface CachedDataState<T> {
  data: T | null;
  isLoading: boolean;
  isCached: boolean;
  error: string | null;
  lastUpdated: Date | null;
}

interface CacheStrategy<T> {
  key: string;
  fetcher: () => Promise<T>;
  ttl?: number; // Time to live in milliseconds
  onError?: (error: Error) => void;
}

export function useCachedData<T>({
  key,
  fetcher,
  ttl = 5 * 60 * 1000, // Default 5 minutes
  onError
}: CacheStrategy<T>): CachedDataState<T> & { refresh: () => Promise<void> } {
  const isOffline = useOfflineStatus();
  const [state, setState] = useState<CachedDataState<T>>({
    data: null,
    isLoading: true,
    isCached: false,
    error: null,
    lastUpdated: null
  });

  const loadData = useCallback(async (forceRefresh = false) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));

    try {
      // Try to load from cache first
      const cached = loadFromCache<T>(key);

      if (cached && !forceRefresh) {
        // Check if cache is still valid
        const isExpired = Date.now() - cached.timestamp > ttl;

        if (!isExpired || isOffline) {
          // Use cached data immediately (offline-first)
          setState({
            data: cached.data,
            isLoading: false,
            isCached: true,
            error: null,
            lastUpdated: new Date(cached.timestamp)
          });

          // If online and cache is expired, refresh in background
          if (!isOffline && isExpired) {
            refreshInBackground();
          }

          return;
        }
      }

      // If offline and no valid cache, show error
      if (isOffline) {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: cached ? 'Showing cached data (offline)' : 'No cached data available (offline)',
          isCached: !!cached,
          lastUpdated: cached ? new Date(cached.timestamp) : null
        }));
        return;
      }

      // Fetch fresh data
      const data = await fetcher();

      // Save to cache
      saveToCache(key, data);

      setState({
        data,
        isLoading: false,
        isCached: false,
        error: null,
        lastUpdated: new Date()
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load data';

      // Try to use cached data on error
      const cached = loadFromCache<T>(key);
      if (cached) {
        setState({
          data: cached.data,
          isLoading: false,
          isCached: true,
          error: `Error loading fresh data: ${errorMessage}. Showing cached version.`,
          lastUpdated: new Date(cached.timestamp)
        });
      } else {
        setState(prev => ({
          ...prev,
          isLoading: false,
          error: errorMessage
        }));
      }

      onError?.(error instanceof Error ? error : new Error(errorMessage));
    }
  }, [key, fetcher, ttl, isOffline, onError]);

  const refreshInBackground = useCallback(async () => {
    try {
      const data = await fetcher();
      saveToCache(key, data);

      setState(prev => ({
        ...prev,
        data,
        isCached: false,
        lastUpdated: new Date()
      }));
    } catch (error) {
      console.warn('[useCachedData] Background refresh failed:', error);
    }
  }, [key, fetcher]);

  const refresh = useCallback(async () => {
    await loadData(true);
  }, [loadData]);

  // Load data on mount and when dependencies change
  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    ...state,
    refresh
  };
}

// Cache storage functions
function loadFromCache<T>(key: string): { data: T; timestamp: number } | null {
  try {
    const stored = localStorage.getItem(`yashin_cache_${key}`);
    if (!stored) return null;

    const parsed = JSON.parse(stored);
    return {
      data: parsed.data,
      timestamp: parsed.timestamp
    };
  } catch {
    return null;
  }
}

function saveToCache<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`yashin_cache_${key}`, JSON.stringify({
      data,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.warn('[useCachedData] Failed to save to cache:', error);
  }
}

// Clear specific cache
export function clearCache(key: string): void {
  try {
    localStorage.removeItem(`yashin_cache_${key}`);
  } catch (error) {
    console.warn('[useCachedData] Failed to clear cache:', error);
  }
}

// Clear all cached data
export function clearAllCache(): void {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('yashin_cache_')) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.warn('[useCachedData] Failed to clear all cache:', error);
  }
}
