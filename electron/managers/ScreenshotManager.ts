import { app, ipcMain, shell, dialog, clipboard, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, statSync, createReadStream } from 'fs';
import { ConfigManager } from './ConfigManager';
import { InstanceManager } from './InstanceManager';
import { createHash } from 'crypto';
import http from 'http';
import https from 'https';

export interface Screenshot {
    id: string;
    filename: string;
    path: string;
    instanceId: string;
    instanceName: string;
    size: number;
    date: number;
    version?: string;
    loader?: string;
}

export class ScreenshotManager {
    constructor() {
        this.registerListeners();
    }

    private registerListeners() {
        ipcMain.handle('screenshots:list', async () => {
            return await this.listAllScreenshots();
        });

        ipcMain.handle('screenshots:delete', async (_: any, screenshotPath: string) => {
            return await this.deleteScreenshot(screenshotPath);
        });

        ipcMain.handle('screenshots:open-location', async (_: any, screenshotPath: string) => {
            return await this.openLocation(screenshotPath);
        });

        ipcMain.handle('screenshots:copy-to-clipboard', async (_: any, screenshotPath: string) => {
            return await this.copyToClipboard(screenshotPath);
        });

        ipcMain.handle('screenshots:export', async (_: any, screenshotPath: string) => {
            return await this.exportScreenshot(screenshotPath);
        });

        ipcMain.handle('screenshots:share-to-cloud', async (_: any, screenshotPath: string, userId: string) => {
            return await this.shareToCloud(screenshotPath, userId);
        });

        ipcMain.handle('screenshots:sync-from-cloud', async (_: any, userId: string, cloudScreenshots: any[]) => {
            return await this.syncFromCloud(userId, cloudScreenshots);
        });

        // Read screenshot as base64 data URL for rendering in UI
        ipcMain.handle('screenshots:get-image', async (_: any, screenshotPath: string) => {
            return await this.getImageAsDataUrl(screenshotPath);
        });
    }

    private async getImageAsDataUrl(screenshotPath: string): Promise<{ success: boolean; dataUrl?: string; error?: string }> {
        try {
            if (!existsSync(screenshotPath)) {
                return { success: false, error: 'Screenshot not found' };
            }

            const fileBuffer = await fs.readFile(screenshotPath);
            const base64 = fileBuffer.toString('base64');

            // Determine mime type from extension
            const ext = path.extname(screenshotPath).toLowerCase();
            let mimeType = 'image/png';
            if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
            else if (ext === '.gif') mimeType = 'image/gif';
            else if (ext === '.bmp') mimeType = 'image/bmp';

            return { success: true, dataUrl: `data:${mimeType};base64,${base64}` };
        } catch (err) {
            console.error('Failed to read screenshot:', err);
            return { success: false, error: String(err) };
        }
    }

    private async listAllScreenshots(): Promise<Screenshot[]> {
        const screenshots: Screenshot[] = [];
        const instanceManager = InstanceManager.getInstance();

        try {
            // Get all instances
            const instances = await instanceManager['getInstances']();

            // Scan each instance for screenshots
            for (const instance of instances) {
                // For imported instances with useExternalPath, screenshots are in the external versions folder
                const screenshotsPaths = this.getScreenshotPaths(instance);

                for (const screenshotsPath of screenshotsPaths) {
                    if (!existsSync(screenshotsPath)) continue;

                    try {
                        const files = await fs.readdir(screenshotsPath);

                        for (const file of files) {
                            // Only include image files
                            if (!/\.(png|jpg|jpeg|gif|bmp)$/i.test(file)) continue;

                            const filePath = path.join(screenshotsPath, file);

                            try {
                                const stats = statSync(filePath);

                                // Avoid duplicates
                                if (!screenshots.some(s => s.path === filePath)) {
                                    screenshots.push({
                                        id: `${instance.id}:${file}`,
                                        filename: file,
                                        path: filePath,
                                        instanceId: instance.id,
                                        instanceName: instance.name,
                                        size: stats.size,
                                        date: stats.mtimeMs,
                                        version: instance.version,
                                        loader: instance.loader
                                    });
                                }
                            } catch (err) {
                                console.warn(`Failed to stat screenshot: ${filePath}`, err);
                            }
                        }
                    } catch (err) {
                        console.warn(`Failed to read screenshots from ${instance.name}`, err);
                    }
                }
            }

            // Sort by date (newest first)
            screenshots.sort((a, b) => b.date - a.date);

        } catch (err) {
            console.error('Failed to list screenshots:', err);
        }

        return screenshots;
    }

    /**
     * Get all possible screenshot paths for an instance.
     * For imported TLauncher instances, screenshots are in the external versions folder.
     */
    private getScreenshotPaths(instance: any): string[] {
        const paths: string[] = [];
        const instancesPath = ConfigManager.getInstancesPath();
        const gamePath = ConfigManager.getGamePath();

        // 1. Check local instance folder (for created instances)
        const localInstancePath = path.join(instancesPath, instance.id, 'screenshots');
        paths.push(localInstancePath);

        // 2. For imported instances (useExternalPath = true), check the external versions folder
        if (instance.useExternalPath || instance.isImported || instance.type === 'imported') {
            // Screenshots in external versions folder: .minecraft/versions/<id>/screenshots
            const externalVersionPath = path.join(gamePath, 'versions', instance.id, 'screenshots');
            paths.push(externalVersionPath);

            // Also check launchVersionId if different from id
            if (instance.launchVersionId && instance.launchVersionId !== instance.id) {
                const launchVersionPath = path.join(gamePath, 'versions', instance.launchVersionId, 'screenshots');
                paths.push(launchVersionPath);
            }
        }

        return paths;
    }

    private resolveInstancePath(instanceId: string): string | null {
        const instancesPath = ConfigManager.getInstancesPath();
        const gamePath = ConfigManager.getGamePath();

        // 1. Check local instances
        let p = path.join(instancesPath, instanceId);
        if (existsSync(p)) {
            // For imported instances, check if it has useExternalPath flag
            const configPath = path.join(p, 'instance.json');
            if (existsSync(configPath)) {
                try {
                    const configContent = require('fs').readFileSync(configPath, 'utf-8');
                    const config = JSON.parse(configContent);
                    if (config.useExternalPath || config.isImported || config.type === 'imported') {
                        // Return the external path instead
                        const externalPath = path.join(gamePath, 'versions', instanceId);
                        if (existsSync(externalPath)) {
                            return externalPath;
                        }
                    }
                } catch (e) {
                    console.warn('Failed to read instance.json for path resolution:', e);
                }
            }
            return p;
        }

        // 2. Check external versions (.minecraft/versions)
        p = path.join(gamePath, 'versions', instanceId);
        if (existsSync(p)) {
            return p;
        }

        return null;
    }

    private async deleteScreenshot(screenshotPath: string): Promise<{ success: boolean; error?: string }> {
        try {
            if (!existsSync(screenshotPath)) {
                return { success: false, error: 'Screenshot not found' };
            }

            await fs.unlink(screenshotPath);
            return { success: true };
        } catch (err) {
            console.error('Failed to delete screenshot:', err);
            return { success: false, error: String(err) };
        }
    }

    private async openLocation(screenshotPath: string): Promise<{ success: boolean; error?: string }> {
        try {
            if (!existsSync(screenshotPath)) {
                return { success: false, error: 'Screenshot not found' };
            }

            // Open the folder containing the screenshot
            const folder = path.dirname(screenshotPath);
            await shell.openPath(folder);
            return { success: true };
        } catch (err) {
            console.error('Failed to open location:', err);
            return { success: false, error: String(err) };
        }
    }

    private async copyToClipboard(screenshotPath: string): Promise<{ success: boolean; error?: string }> {
        try {
            if (!existsSync(screenshotPath)) {
                return { success: false, error: 'Screenshot not found' };
            }

            const image = nativeImage.createFromPath(screenshotPath);
            clipboard.writeImage(image);
            return { success: true };
        } catch (err) {
            console.error('Failed to copy to clipboard:', err);
            return { success: false, error: String(err) };
        }
    }

    private async exportScreenshot(screenshotPath: string): Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }> {
        try {
            if (!existsSync(screenshotPath)) {
                return { success: false, error: 'Screenshot not found' };
            }

            const filename = path.basename(screenshotPath);

            const { filePath } = await dialog.showSaveDialog({
                title: 'Export Screenshot',
                defaultPath: filename,
                filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }]
            });

            if (!filePath) {
                return { success: false, canceled: true };
            }

            await fs.copyFile(screenshotPath, filePath);
            return { success: true, filePath };
        } catch (err) {
            console.error('Failed to export screenshot:', err);
            return { success: false, error: String(err) };
        }
    }

    private async generateFileHash(filePath: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const hash = createHash('sha256');
            const stream = createReadStream(filePath);
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', (err) => reject(err));
        });
    }

    private async shareToCloud(screenshotPath: string, userId: string): Promise<{ success: boolean; publicUrl?: string; hash?: string; error?: string }> {
        try {
            if (!existsSync(screenshotPath)) {
                return { success: false, error: 'Screenshot not found' };
            }

            // Generate hash for duplicate prevention
            const hash = await this.generateFileHash(screenshotPath);

            // Read the screenshot file
            const fileBuffer = await fs.readFile(screenshotPath);
            const base64Data = fileBuffer.toString('base64');

            return {
                success: true,
                publicUrl: base64Data, // Frontend will handle actual upload
                hash: hash
            };
        } catch (err) {
            console.error('Failed to prepare screenshot for cloud:', err);
            return { success: false, error: String(err) };
        }
    }

    private async syncFromCloud(userId: string, cloudScreenshots: any[]): Promise<{ success: boolean; syncedCount: number; error?: string }> {
        try {
            const instancesPath = ConfigManager.getInstancesPath();
            const syncPath = path.join(instancesPath, 'cloud-sync', 'screenshots');

            // Ensure sync directory exists
            if (!existsSync(syncPath)) {
                await fs.mkdir(syncPath, { recursive: true });
            }

            // Get local screenshots for hash comparison
            const localScreenshots = await this.listAllScreenshots();
            const localHashes = new Set<string>();

            // Calculate hashes for local screenshots
            for (const s of localScreenshots) {
                try {
                    const h = await this.generateFileHash(s.path);
                    localHashes.add(h);
                } catch (e) {
                    console.warn(`Failed to hash local file: ${s.path}`);
                }
            }

            let syncedCount = 0;

            for (const cloudScreenshot of cloudScreenshots) {
                if (localHashes.has(cloudScreenshot.hash)) {
                    continue; // Already exists locally
                }

                // Download and save
                const targetPath = path.join(syncPath, cloudScreenshot.filename);

                // If filename exists but hash different, append timestamp
                let finalPath = targetPath;
                if (existsSync(targetPath)) {
                    const ext = path.extname(cloudScreenshot.filename);
                    const name = path.basename(cloudScreenshot.filename, ext);
                    finalPath = path.join(syncPath, `${name}_${Date.now()}${ext}`);
                }

                const success = await this.downloadFile(cloudScreenshot.url, finalPath);
                if (success) {
                    syncedCount++;
                }
            }

            return { success: true, syncedCount };
        } catch (err) {
            console.error('Failed to sync from cloud:', err);
            return { success: false, syncedCount: 0, error: String(err) };
        }
    }

    private async downloadFile(url: string, dest: string): Promise<boolean> {
        return new Promise((resolve) => {
            const file = require('fs').createWriteStream(dest);
            const protocol = url.startsWith('https') ? https : http;

            protocol.get(url, (response: any) => {
                if (response.statusCode !== 200) {
                    resolve(false);
                    return;
                }
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(true);
                });
            }).on('error', (err: any) => {
                require('fs').unlinkSync(dest);
                console.error(`Download failed for ${url}:`, err);
                resolve(false);
            });
        });
    }
}
