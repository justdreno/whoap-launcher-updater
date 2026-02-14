import { ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, readdirSync } from 'fs';
import { ConfigManager } from './ConfigManager';

export interface ShaderPack {
    name: string;
    path: string;
    size: number;
    isEnabled: boolean;
}

export class ShaderPackManager {
    constructor() {
        this.registerListeners();
    }

    private registerListeners() {
        // List packs
        ipcMain.handle('shaderpacks:list', async (_, instanceId: string) => {
            try {
                return await this.getPacks(instanceId);
            } catch (error) {
                console.error("Failed to list shader packs:", error);
                return [];
            }
        });

        // Toggle a pack
        ipcMain.handle('shaderpacks:toggle', async (_, instanceId: string, packName: string) => {
            try {
                return await this.togglePack(instanceId, packName);
            } catch (error) {
                console.error("Failed to toggle shader pack:", error);
                return { success: false, error: String(error) };
            }
        });

        // Delete a pack
        ipcMain.handle('shaderpacks:delete', async (_, instanceId: string, packName: string) => {
            try {
                return await this.deletePack(instanceId, packName);
            } catch (error) {
                console.error("Failed to delete shader pack:", error);
                return { success: false, error: String(error) };
            }
        });

        // Add packs (via file dialog)
        ipcMain.handle('shaderpacks:add', async (_, instanceId: string) => {
            console.log(`[ShaderPackManager] Add requested for instance: ${instanceId}`);
            try {
                const result = await dialog.showOpenDialog({
                    properties: ['openFile', 'multiSelections'],
                    filters: [{ name: 'Shader Packs', extensions: ['zip'] }]
                });

                if (!result.canceled && result.filePaths.length > 0) {
                    const packsPath = this.getPacksPath(instanceId);
                    console.log(`[ShaderPackManager] Target path: ${packsPath}`);
                    await fs.mkdir(packsPath, { recursive: true });

                    for (const filePath of result.filePaths) {
                        const fileName = path.basename(filePath);
                        await fs.copyFile(filePath, path.join(packsPath, fileName));
                    }
                    return { success: true };
                }
                console.log('[ShaderPackManager] Selection cancelled');
                return { success: false, canceled: true };
            } catch (error) {
                console.error("Failed to add shader packs:", error);
                return { success: false, error: String(error) };
            }
        });
    }

    private getPacksPath(instanceId: string): string {
        const instancesPath = ConfigManager.getInstancesPath();
        const instancePath = path.join(instancesPath, instanceId);
        const configPath = path.join(instancePath, 'instance.json');

        // Check instance config for external path usage
        if (existsSync(configPath)) {
            try {
                const data = JSON.parse(readdirSync(instancePath).includes('instance.json')
                    ? require('fs').readFileSync(configPath, 'utf8')
                    : '{}');

                if (data.useExternalPath) {
                    const gamePath = ConfigManager.getGamePath();
                    return path.join(gamePath, 'versions', instanceId, 'shaderpacks');
                }
            } catch (e) {
                console.error(`[ShaderPackManager] Failed to read instance.json for ${instanceId}:`, e);
            }
        }

        // Default: Look in the instance's own folder
        if (existsSync(instancePath)) {
            return path.join(instancePath, 'shaderpacks');
        }

        // Fallback
        const gamePath = ConfigManager.getGamePath();
        return path.join(gamePath, 'versions', instanceId, 'shaderpacks');
    }

    private async getPacks(instanceId: string): Promise<ShaderPack[]> {
        const packsPath = this.getPacksPath(instanceId);
        const packs: ShaderPack[] = [];

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
