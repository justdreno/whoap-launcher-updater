import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
}

export class CacheManager {
    private static cacheDir: string;
    
    static initialize() {
        this.cacheDir = path.join(app.getPath('userData'), 'cache');
        // Ensure cache directory exists
        if (!existsSync(this.cacheDir)) {
            fs.mkdir(this.cacheDir, { recursive: true });
        }
    }
    
    static async get<T>(key: string): Promise<{ data: T; age: number } | null> {
        try {
            const cachePath = path.join(this.cacheDir, `${key}.json`);
            
            if (!existsSync(cachePath)) {
                return null;
            }
            
            const content = await fs.readFile(cachePath, 'utf-8');
            const entry: CacheEntry<T> = JSON.parse(content);
            
            // Check if expired
            if (entry.expiresAt < Date.now()) {
                await fs.unlink(cachePath);
                return null;
            }
            
            const age = Date.now() - entry.timestamp;
            return { data: entry.data, age };
        } catch (error) {
            console.error(`[CacheManager] Failed to read cache for ${key}:`, error);
            return null;
        }
    }
    
    static async set<T>(key: string, data: T, ttlHours: number = 168): Promise<void> {
        try {
            const cachePath = path.join(this.cacheDir, `${key}.json`);
            
            const entry: CacheEntry<T> = {
                data,
                timestamp: Date.now(),
                expiresAt: Date.now() + (ttlHours * 60 * 60 * 1000)
            };
            
            await fs.writeFile(cachePath, JSON.stringify(entry, null, 2));
        } catch (error) {
            console.error(`[CacheManager] Failed to write cache for ${key}:`, error);
        }
    }
    
    static async delete(key: string): Promise<void> {
        try {
            const cachePath = path.join(this.cacheDir, `${key}.json`);
            if (existsSync(cachePath)) {
                await fs.unlink(cachePath);
            }
        } catch (error) {
            console.error(`[CacheManager] Failed to delete cache for ${key}:`, error);
        }
    }
    
    static async clear(): Promise<void> {
        try {
            const files = await fs.readdir(this.cacheDir);
            for (const file of files) {
                if (file.endsWith('.json')) {
                    await fs.unlink(path.join(this.cacheDir, file));
                }
            }
        } catch (error) {
            console.error('[CacheManager] Failed to clear cache:', error);
        }
    }
    
    static async getLastUpdated(key: string): Promise<Date | null> {
        try {
            const cachePath = path.join(this.cacheDir, `${key}.json`);
            
            if (!existsSync(cachePath)) {
                return null;
            }
            
            const content = await fs.readFile(cachePath, 'utf-8');
            const entry = JSON.parse(content);
            return new Date(entry.timestamp);
        } catch {
            return null;
        }
    }
    
    static formatAge(ageMs: number): string {
        const seconds = Math.floor(ageMs / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
        if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
        if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
        return 'Just now';
    }
}

// Initialize on module load
CacheManager.initialize();
