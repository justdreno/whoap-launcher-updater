import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import https from 'https';
import { IncomingMessage } from 'http';

interface SkinCacheEntry {
    username: string;
    type: 'skin' | 'avatar' | 'cape';
    timestamp: number;
    expiresAt: number;
    source: 'mc-heads' | 'mojang' | 'local';
}

interface SkinCacheMetadata {
    entries: { [key: string]: SkinCacheEntry };
    version: string;
}

const CACHE_VERSION = '1.0';
const SKIN_CACHE_TTL_DAYS = 7; // Cache skins for 7 days

export class SkinCacheManager {
    private static skinsDir: string;
    private static avatarsDir: string;
    private static capesDir: string;
    private static metadataPath: string;
    private static metadata: SkinCacheMetadata = { entries: {}, version: CACHE_VERSION };
    private static initialized = false;

    static initialize() {
        if (this.initialized) return;
        
        const cacheDir = path.join(app.getPath('userData'), 'cache');
        this.skinsDir = path.join(cacheDir, 'skins');
        this.avatarsDir = path.join(cacheDir, 'avatars');
        this.capesDir = path.join(cacheDir, 'capes');
        this.metadataPath = path.join(cacheDir, 'skin-cache-metadata.json');

        // Ensure directories exist
        Promise.all([
            fs.mkdir(this.skinsDir, { recursive: true }),
            fs.mkdir(this.avatarsDir, { recursive: true }),
            fs.mkdir(this.capesDir, { recursive: true })
        ]).then(() => {
            this.loadMetadata();
            this.initialized = true;
            console.log('[SkinCacheManager] Initialized');
        });
    }

    private static async loadMetadata(): Promise<void> {
        try {
            if (existsSync(this.metadataPath)) {
                const content = await fs.readFile(this.metadataPath, 'utf-8');
                const data = JSON.parse(content);
                if (data.version === CACHE_VERSION) {
                    this.metadata = data;
                    // Clean up expired entries
                    this.cleanupExpired();
                }
            }
        } catch (error) {
            console.warn('[SkinCacheManager] Failed to load metadata:', error);
        }
    }

    private static async saveMetadata(): Promise<void> {
        try {
            await fs.writeFile(this.metadataPath, JSON.stringify(this.metadata, null, 2));
        } catch (error) {
            console.error('[SkinCacheManager] Failed to save metadata:', error);
        }
    }

    private static cleanupExpired(): void {
        const now = Date.now();
        const expired: string[] = [];
        
        for (const [key, entry] of Object.entries(this.metadata.entries)) {
            if (entry.expiresAt < now) {
                expired.push(key);
            }
        }

        expired.forEach(key => delete this.metadata.entries[key]);
    }

    private static getCacheKey(username: string, type: 'skin' | 'avatar' | 'cape'): string {
        return `${username.toLowerCase()}_${type}`;
    }

    private static getCachePath(username: string, type: 'skin' | 'avatar' | 'cape'): string {
        const safeUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
        switch (type) {
            case 'skin': return path.join(this.skinsDir, `${safeUsername}.png`);
            case 'avatar': return path.join(this.avatarsDir, `${safeUsername}.png`);
            case 'cape': return path.join(this.capesDir, `${safeUsername}.png`);
        }
    }

    static async getCachedSkin(username: string, type: 'skin' | 'avatar' = 'skin'): Promise<string | null> {
        if (!this.initialized) this.initialize();
        
        const key = this.getCacheKey(username, type);
        const entry = this.metadata.entries[key];
        
        if (!entry) return null;
        
        const cachePath = this.getCachePath(username, type);
        
        // Check if file exists
        if (!existsSync(cachePath)) {
            delete this.metadata.entries[key];
            await this.saveMetadata();
            return null;
        }

        // Return cached file path
        return cachePath;
    }

    static async cacheSkin(
        username: string, 
        type: 'skin' | 'avatar' | 'cape' = 'skin',
        imageBuffer?: Buffer
    ): Promise<string | null> {
        if (!this.initialized) this.initialize();

        const key = this.getCacheKey(username, type);
        const cachePath = this.getCachePath(username, type);

        try {
            let buffer: Buffer | null = imageBuffer ?? null;
            
            // If no buffer provided, download from mc-heads
            if (!buffer) {
                const url = type === 'skin' 
                    ? `https://mc-heads.net/skin/${encodeURIComponent(username)}`
                    : type === 'avatar'
                    ? `https://mc-heads.net/avatar/${encodeURIComponent(username)}`
                    : `https://mc-heads.net/cape/${encodeURIComponent(username)}`;

                buffer = await this.downloadImage(url);
                if (!buffer) return null;
            }

            // Save to cache
            await fs.writeFile(cachePath, buffer);

            // Update metadata
            const now = Date.now();
            this.metadata.entries[key] = {
                username: username.toLowerCase(),
                type,
                timestamp: now,
                expiresAt: now + (SKIN_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000),
                source: 'mc-heads'
            };

            await this.saveMetadata();
            console.log(`[SkinCacheManager] Cached ${type} for ${username}`);
            
            return cachePath;
        } catch (error) {
            console.error(`[SkinCacheManager] Failed to cache ${type} for ${username}:`, error);
            return null;
        }
    }

    private static downloadImage(url: string): Promise<Buffer | null> {
        return new Promise((resolve) => {
            https.get(url, (response: IncomingMessage) => {
                if (response.statusCode !== 200) {
                    resolve(null);
                    return;
                }

                const chunks: Buffer[] = [];
                response.on('data', (chunk: Buffer) => chunks.push(chunk));
                response.on('end', () => resolve(Buffer.concat(chunks)));
                response.on('error', () => resolve(null));
            }).on('error', () => resolve(null));
        });
    }

    static async getSkinUrl(username: string, type: 'skin' | 'avatar' = 'skin'): Promise<string> {
        // Check cache first
        const cached = await this.getCachedSkin(username, type);
        if (cached) {
            // Return file:// URL for cached skin
            return `file://${cached}`;
        }

        // Not in cache, return online URL
        return type === 'skin'
            ? `https://mc-heads.net/skin/${encodeURIComponent(username)}`
            : `https://mc-heads.net/avatar/${encodeURIComponent(username)}`;
    }

    static async refreshSkin(username: string, type: 'skin' | 'avatar' | 'cape' = 'skin'): Promise<string | null> {
        // Download and cache fresh copy
        return this.cacheSkin(username, type);
    }

    static async clearCache(): Promise<void> {
        if (!this.initialized) this.initialize();

        try {
            // Delete all cached files
            const [skins, avatars, capes] = await Promise.all([
                fs.readdir(this.skinsDir).catch(() => [] as string[]),
                fs.readdir(this.avatarsDir).catch(() => [] as string[]),
                fs.readdir(this.capesDir).catch(() => [] as string[])
            ]);

            await Promise.all([
                ...skins.map(f => fs.unlink(path.join(this.skinsDir, f)).catch(() => {})),
                ...avatars.map(f => fs.unlink(path.join(this.avatarsDir, f)).catch(() => {})),
                ...capes.map(f => fs.unlink(path.join(this.capesDir, f)).catch(() => {}))
            ]);

            // Clear metadata
            this.metadata.entries = {};
            await this.saveMetadata();

            console.log('[SkinCacheManager] Cache cleared');
        } catch (error) {
            console.error('[SkinCacheManager] Failed to clear cache:', error);
        }
    }

    static async deleteSkin(username: string, type?: 'skin' | 'avatar' | 'cape'): Promise<void> {
        if (!this.initialized) this.initialize();

        const types: ('skin' | 'avatar' | 'cape')[] = type ? [type] : ['skin', 'avatar', 'cape'];
        
        for (const t of types) {
            const key = this.getCacheKey(username, t);
            const cachePath = this.getCachePath(username, t);

            try {
                if (existsSync(cachePath)) {
                    await fs.unlink(cachePath);
                }
                delete this.metadata.entries[key];
            } catch (error) {
                console.warn(`[SkinCacheManager] Failed to delete ${t} for ${username}:`, error);
            }
        }

        await this.saveMetadata();
    }

    static getCacheStatus(): { 
        total: number; 
        skins: number; 
        avatars: number; 
        capes: number;
        oldestEntry?: Date;
    } {
        const entries = Object.values(this.metadata.entries);
        const skins = entries.filter(e => e.type === 'skin').length;
        const avatars = entries.filter(e => e.type === 'avatar').length;
        const capes = entries.filter(e => e.type === 'cape').length;

        const timestamps = entries.map(e => e.timestamp);
        const oldestEntry = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : undefined;

        return { total: entries.length, skins, avatars, capes, oldestEntry };
    }

    static isInitialized(): boolean {
        return this.initialized;
    }
}

// Initialize on module load
SkinCacheManager.initialize();
