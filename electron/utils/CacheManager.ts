import { app } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, statSync } from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    expiresAt: number;
    version: string;
    checksum?: string;
}

interface CacheHealth {
    totalFiles: number;
    validFiles: number;
    corruptedFiles: number;
    expiredFiles: number;
    totalSize: number;
    diskSpaceAvailable: number;
    health: 'healthy' | 'degraded' | 'critical';
}

const CACHE_VERSION = '1.0';
const MAX_CACHE_SIZE_MB = 500; // 500MB max cache size
const MIN_FREE_SPACE_MB = 100; // Minimum 100MB free space required
const MAX_CACHE_AGE_DAYS = 30; // Auto-cleanup files older than 30 days

export class CacheManager {
    private static cacheDir: string;
    private static healthCheckInterval: NodeJS.Timeout | null = null;
    private static lastHealthCheck: CacheHealth | null = null;
    
    static initialize() {
        this.cacheDir = path.join(app.getPath('userData'), 'cache');
        this.ensureDirectory();
        this.startHealthCheck();
    }

    private static async ensureDirectory(): Promise<void> {
        try {
            if (!existsSync(this.cacheDir)) {
                await fs.mkdir(this.cacheDir, { recursive: true });
                console.log('[CacheManager] Created cache directory');
            }
        } catch (error) {
            console.error('[CacheManager] Failed to create cache directory:', error);
        }
    }

    private static startHealthCheck(): void {
        // Run health check every 5 minutes
        this.healthCheckInterval = setInterval(() => {
            this.performHealthCheck();
        }, 5 * 60 * 1000);
        
        // Run initial health check after 10 seconds
        setTimeout(() => this.performHealthCheck(), 10000);
    }

    static stopHealthCheck(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    private static async performHealthCheck(): Promise<void> {
        try {
            const health = await this.checkHealth();
            this.lastHealthCheck = health;
            
            // Auto-cleanup if cache is too large
            if (health.totalSize > MAX_CACHE_SIZE_MB * 1024 * 1024) {
                console.warn(`[CacheManager] Cache size (${Math.round(health.totalSize / 1024 / 1024)}MB) exceeds limit (${MAX_CACHE_SIZE_MB}MB), cleaning up...`);
                await this.cleanupOldCache();
            }
            
            // Log health status
            if (health.corruptedFiles > 0) {
                console.warn(`[CacheManager] Found ${health.corruptedFiles} corrupted cache files`);
            }
            
            if (health.health === 'critical') {
                console.error('[CacheManager] Cache health is critical, consider clearing cache');
            }
        } catch (error) {
            console.error('[CacheManager] Health check failed:', error);
        }
    }

    static async checkHealth(): Promise<CacheHealth> {
        try {
            if (!existsSync(this.cacheDir)) {
                return {
                    totalFiles: 0,
                    validFiles: 0,
                    corruptedFiles: 0,
                    expiredFiles: 0,
                    totalSize: 0,
                    diskSpaceAvailable: 0,
                    health: 'healthy'
                };
            }

            const files = await fs.readdir(this.cacheDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            
            let validFiles = 0;
            let corruptedFiles = 0;
            let expiredFiles = 0;
            let totalSize = 0;
            const now = Date.now();
            const maxAge = MAX_CACHE_AGE_DAYS * 24 * 60 * 60 * 1000;

            for (const file of jsonFiles) {
                const filePath = path.join(this.cacheDir, file);
                try {
                    const stats = statSync(filePath);
                    totalSize += stats.size;
                    
                    const content = await fs.readFile(filePath, 'utf-8');
                    const entry = JSON.parse(content);
                    
                    // Check if valid cache entry
                    if (!this.isValidEntry(entry)) {
                        corruptedFiles++;
                        continue;
                    }
                    
                    // Check if expired
                    if (entry.expiresAt < now) {
                        expiredFiles++;
                    } else if (now - entry.timestamp > maxAge) {
                        // File is too old, mark as expired
                        expiredFiles++;
                    } else {
                        validFiles++;
                    }
                } catch {
                    corruptedFiles++;
                }
            }

            // Get disk space
            const diskSpaceAvailable = await this.getDiskSpace();

            // Determine health status
            let health: 'healthy' | 'degraded' | 'critical' = 'healthy';
            if (diskSpaceAvailable < MIN_FREE_SPACE_MB * 1024 * 1024) {
                health = 'critical';
            } else if (corruptedFiles > validFiles * 0.1 || expiredFiles > validFiles * 0.5) {
                health = 'degraded';
            }

            return {
                totalFiles: jsonFiles.length,
                validFiles,
                corruptedFiles,
                expiredFiles,
                totalSize,
                diskSpaceAvailable,
                health
            };
        } catch (error) {
            console.error('[CacheManager] Failed to check health:', error);
            return {
                totalFiles: 0,
                validFiles: 0,
                corruptedFiles: 0,
                expiredFiles: 0,
                totalSize: 0,
                diskSpaceAvailable: 0,
                health: 'critical'
            };
        }
    }

    private static isValidEntry(entry: any): boolean {
        return (
            entry &&
            typeof entry === 'object' &&
            'data' in entry &&
            typeof entry.timestamp === 'number' &&
            typeof entry.expiresAt === 'number' &&
            entry.version === CACHE_VERSION
        );
    }

    private static async getDiskSpace(): Promise<number> {
        try {
            const { stdout } = await execAsync('wmic logicaldisk get size,freespace,caption');
            const lines = stdout.trim().split('\n').slice(1);
            
            for (const line of lines) {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 3) {
                    const freeSpace = parseInt(parts[1], 10);
                    if (!isNaN(freeSpace)) {
                        return freeSpace;
                    }
                }
            }
        } catch {
            // Fallback: assume plenty of space
        }
        return 1024 * 1024 * 1024; // Return 1GB as fallback
    }

    private static async cleanupOldCache(): Promise<void> {
        try {
            const files = await fs.readdir(this.cacheDir);
            const now = Date.now();
            const maxAge = MAX_CACHE_AGE_DAYS * 24 * 60 * 60 * 1000;
            
            // Sort files by modification time (oldest first)
            const fileStats = await Promise.all(
                files
                    .filter(f => f.endsWith('.json'))
                    .map(async (file) => {
                        const filePath = path.join(this.cacheDir, file);
                        const stats = statSync(filePath);
                        return { file, filePath, stats };
                    })
            );
            
            fileStats.sort((a, b) => a.stats.mtime.getTime() - b.stats.mtime.getTime());
            
            let cleaned = 0;
            for (const { file, filePath, stats } of fileStats) {
                // Delete if too old
                if (now - stats.mtime.getTime() > maxAge) {
                    try {
                        await fs.unlink(filePath);
                        cleaned++;
                    } catch (e) {
                        console.warn(`[CacheManager] Failed to delete old cache file ${file}:`, e);
                    }
                }
            }
            
            if (cleaned > 0) {
                console.log(`[CacheManager] Cleaned up ${cleaned} old cache files`);
            }
        } catch (error) {
            console.error('[CacheManager] Failed to cleanup old cache:', error);
        }
    }

    static async hasEnoughDiskSpace(requiredBytes: number = 10 * 1024 * 1024): Promise<boolean> {
        try {
            const available = await this.getDiskSpace();
            return available >= requiredBytes + MIN_FREE_SPACE_MB * 1024 * 1024;
        } catch {
            return true; // Assume OK if we can't check
        }
    }
    
    static async get<T>(key: string): Promise<{ data: T; age: number } | null> {
        try {
            const cachePath = path.join(this.cacheDir, `${key}.json`);
            
            if (!existsSync(cachePath)) {
                return null;
            }
            
            const content = await fs.readFile(cachePath, 'utf-8');
            let entry: CacheEntry<T>;
            
            try {
                entry = JSON.parse(content);
            } catch (parseError) {
                console.error(`[CacheManager] Corrupted cache file for ${key}, deleting...`);
                await fs.unlink(cachePath).catch(() => {});
                return null;
            }
            
            // Validate entry structure
            if (!this.isValidEntry(entry)) {
                console.warn(`[CacheManager] Invalid cache entry for ${key}, deleting...`);
                await fs.unlink(cachePath).catch(() => {});
                return null;
            }
            
            // Check if expired
            if (entry.expiresAt < Date.now()) {
                await fs.unlink(cachePath).catch(() => {});
                return null;
            }
            
            const age = Date.now() - entry.timestamp;
            return { data: entry.data, age };
        } catch (error) {
            console.error(`[CacheManager] Failed to read cache for ${key}:`, error);
            return null;
        }
    }
    
    static async set<T>(key: string, data: T, ttlHours: number = 168): Promise<boolean> {
        try {
            // Check disk space before writing
            const estimatedSize = JSON.stringify(data).length * 2; // Rough estimate
            if (!await this.hasEnoughDiskSpace(estimatedSize)) {
                console.warn(`[CacheManager] Not enough disk space to cache ${key}`);
                return false;
            }
            
            const cachePath = path.join(this.cacheDir, `${key}.json`);
            
            const entry: CacheEntry<T> = {
                data,
                timestamp: Date.now(),
                expiresAt: Date.now() + (ttlHours * 60 * 60 * 1000),
                version: CACHE_VERSION
            };
            
            // Write to temp file first, then rename (atomic operation)
            const tempPath = `${cachePath}.tmp`;
            await fs.writeFile(tempPath, JSON.stringify(entry, null, 2));
            await fs.rename(tempPath, cachePath);
            
            return true;
        } catch (error) {
            console.error(`[CacheManager] Failed to write cache for ${key}:`, error);
            return false;
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
            let deleted = 0;
            for (const file of files) {
                if (file.endsWith('.json')) {
                    try {
                        await fs.unlink(path.join(this.cacheDir, file));
                        deleted++;
                    } catch (e) {
                        console.warn(`[CacheManager] Failed to delete ${file}:`, e);
                    }
                }
            }
            console.log(`[CacheManager] Cleared ${deleted} cache files`);
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
            let entry;
            
            try {
                entry = JSON.parse(content);
            } catch {
                return null;
            }
            
            if (!this.isValidEntry(entry)) {
                return null;
            }
            
            return new Date(entry.timestamp);
        } catch {
            return null;
        }
    }

    static async getStats(): Promise<{
        totalFiles: number;
        totalSize: number;
        oldestFile: Date | null;
        newestFile: Date | null;
    }> {
        try {
            const files = await fs.readdir(this.cacheDir);
            const jsonFiles = files.filter(f => f.endsWith('.json'));
            
            let totalSize = 0;
            let oldestTime = Infinity;
            let newestTime = 0;
            
            for (const file of jsonFiles) {
                const filePath = path.join(this.cacheDir, file);
                try {
                    const stats = statSync(filePath);
                    totalSize += stats.size;
                    const time = stats.mtime.getTime();
                    if (time < oldestTime) oldestTime = time;
                    if (time > newestTime) newestTime = time;
                } catch {
                    // Ignore errors
                }
            }
            
            return {
                totalFiles: jsonFiles.length,
                totalSize,
                oldestFile: oldestTime !== Infinity ? new Date(oldestTime) : null,
                newestFile: newestTime !== 0 ? new Date(newestTime) : null
            };
        } catch {
            return {
                totalFiles: 0,
                totalSize: 0,
                oldestFile: null,
                newestFile: null
            };
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
