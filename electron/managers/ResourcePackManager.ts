import { ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { ConfigManager } from './ConfigManager';

export interface ResourcePack {
    name: string;
    path: string;
    size: number;
    isEnabled: boolean;
}

export class ResourcePackManager {
    constructor() {
        this.registerListeners();
    }

    private registerListeners() {
        // List packs
        ipcMain.handle('resourcepacks:list', async (_, instanceId: string) => {
            try {
                return await this.getPacks(instanceId);
            } catch (error) {
                console.error("Failed to list resource packs:", error);
                return [];
            }
        });

        // Toggle a pack
        ipcMain.handle('resourcepacks:toggle', async (_, instanceId: string, packName: string) => {
            try {
                return await this.togglePack(instanceId, packName);
            } catch (error) {
                console.error("Failed to toggle resource pack:", error);
                return { success: false, error: String(error) };
            }
        });

        // Delete a pack
        ipcMain.handle('resourcepacks:delete', async (_, instanceId: string, packName: string) => {
            try {
                return await this.deletePack(instanceId, packName);
            } catch (error) {
                console.error("Failed to delete resource pack:", error);
                return { success: false, error: String(error) };
            }
        });

        // Add packs (via file dialog)
        ipcMain.handle('resourcepacks:add', async (_, instanceId: string) => {
            console.log(`[ResourcePackManager] Add requested for instance: ${instanceId}`);
            try {
                const result = await dialog.showOpenDialog({
                    properties: ['openFile', 'multiSelections'],
                    filters: [{ name: 'Resource Packs', extensions: ['zip'] }]
                });

                if (!result.canceled && result.filePaths.length > 0) {
                    console.log(`[ResourcePackManager] Selected files:`, result.filePaths);
                    const packsPath = this.getPacksPath(instanceId);
                    console.log(`[ResourcePackManager] Target path: ${packsPath}`);

                    await fs.mkdir(packsPath, { recursive: true });

                    for (const filePath of result.filePaths) {
                        const fileName = path.basename(filePath);
                        const destPath = path.join(packsPath, fileName);
                        console.log(`[ResourcePackManager] Copying ${filePath} to ${destPath}`);
                        await fs.copyFile(filePath, destPath);
                    }
                    return { success: true };
                }
                console.log('[ResourcePackManager] Selection cancelled');
                return { success: false, canceled: true };
            } catch (error) {
                console.error("Failed to add resource packs:", error);
                return { success: false, error: String(error) };
            }
        });
    }

    private getPacksPath(instanceId: string): string {
        const instancesPath = ConfigManager.getInstancesPath();
        const instancePath = path.join(instancesPath, instanceId);
        const configPath = path.join(instancePath, 'instance.json');

        // Check instance config for external path usage (consistent with logic in ModsManager)
        if (existsSync(configPath)) {
            try {
                const data = JSON.parse(readdirSync(instancePath).includes('instance.json')
                    ? require('fs').readFileSync(configPath, 'utf8')
                    : '{}');

                if (data.useExternalPath) {
                    const gamePath = ConfigManager.getGamePath();
                    return path.join(gamePath, 'versions', instanceId, 'resourcepacks');
                }
            } catch (e) {
                console.error(`[ResourcePackManager] Failed to read instance.json for ${instanceId}:`, e);
            }
        }

        // Default: Look in the instance's own folder
        if (existsSync(instancePath)) {
            return path.join(instancePath, 'resourcepacks');
        }

        // Fallback
        const gamePath = ConfigManager.getGamePath();
        return path.join(gamePath, 'versions', instanceId, 'resourcepacks');
    }

    private async getPacks(instanceId: string): Promise<ResourcePack[]> {
        const packsPath = this.getPacksPath(instanceId);
        const packs: ResourcePack[] = [];

        if (existsSync(packsPath)) {
            const files = await fs.readdir(packsPath);
            for (const file of files) {
                if (file.endsWith('.zip') || file.endsWith('.zip.disabled')) {
                    const filePath = path.join(packsPath, file);
                    const stats = await fs.stat(filePath);
                    const isEnabled = file.endsWith('.zip');

                    packs.push({
                        name: file,
                        path: filePath,
                        size: stats.size,
                        isEnabled
                    });
                }
            }
        }
        return packs;
    }

    private async togglePack(instanceId: string, packName: string) {
        const packsPath = this.getPacksPath(instanceId);
        const oldPath = path.join(packsPath, packName);

        let newName = '';
        if (packName.endsWith('.disabled')) {
            newName = packName.replace('.disabled', '');
        } else {
            newName = packName + '.disabled';
        }

        const newPath = path.join(packsPath, newName);
        await fs.rename(oldPath, newPath);
        return { success: true, newName };
    }

    private async deletePack(instanceId: string, packName: string) {
        const packsPath = this.getPacksPath(instanceId);
        const filePath = path.join(packsPath, packName);
        await fs.unlink(filePath);
        return { success: true };
    }
}
