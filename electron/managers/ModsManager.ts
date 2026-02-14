import { ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync, readdirSync, statSync } from 'fs';
import { ConfigManager } from './ConfigManager';

export interface Mod {
    name: string;
    path: string;
    size: number;
    isEnabled: boolean;
}

export class ModsManager {
    constructor() {
        this.registerListeners();
    }

    private registerListeners() {
        // List mods for an instance
        ipcMain.handle('mods:list', async (_, instanceId: string) => {
            try {
                return await this.getMods(instanceId);
            } catch (error) {
                console.error("Failed to list mods:", error);
                return [];
            }
        });

        // Toggle a mod (enable/disable)
        ipcMain.handle('mods:toggle', async (_, instanceId: string, modName: string) => {
            try {
                return await this.toggleMod(instanceId, modName);
            } catch (error) {
                console.error("Failed to toggle mod:", error);
                return { success: false, error: String(error) };
            }
        });

        // Delete a mod
        ipcMain.handle('mods:delete', async (_, instanceId: string, modName: string) => {
            try {
                return await this.deleteMod(instanceId, modName);
            } catch (error) {
                console.error("Failed to delete mod:", error);
                return { success: false, error: String(error) };
            }
        });

        // Add mods (via file dialog)
        ipcMain.handle('mods:add', async (_, instanceId: string) => {
            try {
                const result = await dialog.showOpenDialog({
                    properties: ['openFile', 'multiSelections'],
                    filters: [{ name: 'Mods', extensions: ['jar'] }]
                });

                if (!result.canceled && result.filePaths.length > 0) {
                    const modsPath = this.getModsPath(instanceId);
                    await fs.mkdir(modsPath, { recursive: true });

                    for (const filePath of result.filePaths) {
                        const fileName = path.basename(filePath);
                        await fs.copyFile(filePath, path.join(modsPath, fileName));
                    }
                    return { success: true };
                }
                return { success: false, canceled: true };
            } catch (error) {
                console.error("Failed to add mods:", error);
                return { success: false, error: String(error) };
            }
        });
    }

    private getModsPath(instanceId: string): string {
        const instancesPath = ConfigManager.getInstancesPath();
        const instancePath = path.join(instancesPath, instanceId);
        const configPath = path.join(instancePath, 'instance.json');

        // 1. Check for referenced imports (no-copy)
        if (existsSync(configPath)) {
            try {
                const data = JSON.parse(readdirSync(instancePath).includes('instance.json')
                    ? require('fs').readFileSync(configPath, 'utf8')
                    : '{}');

                if (data.useExternalPath) {
                    const gamePath = ConfigManager.getGamePath();
                    return path.join(gamePath, 'versions', instanceId, 'mods');
                }
            } catch (e) {
                console.error(`[ModsManager] Failed to read instance.json for ${instanceId}:`, e);
            }
        }

        // 2. Default: Look in the instance's own folder
        if (existsSync(instancePath)) {
            return path.join(instancePath, 'mods');
        }

        // 3. Last resort: standard versions folder (legacy/fallback)
        const gamePath = ConfigManager.getGamePath();
        return path.join(gamePath, 'versions', instanceId, 'mods');
    }

    private async getMods(instanceId: string): Promise<Mod[]> {
        const modsPath = this.getModsPath(instanceId);
        const mods: Mod[] = [];

        if (existsSync(modsPath)) {
            const files = await fs.readdir(modsPath);
            for (const file of files) {
                if (file.endsWith('.jar') || file.endsWith('.jar.disabled')) {
                    const filePath = path.join(modsPath, file);
                    const stats = await fs.stat(filePath);
                    const isEnabled = file.endsWith('.jar');

                    mods.push({
                        name: file,
                        path: filePath,
                        size: stats.size,
                        isEnabled
                    });
                }
            }
        }
        return mods;
    }

    private async toggleMod(instanceId: string, modName: string) {
        const modsPath = this.getModsPath(instanceId);
        const oldPath = path.join(modsPath, modName);

        let newName = '';
        if (modName.endsWith('.disabled')) {
            newName = modName.replace('.disabled', '');
        } else {
            newName = modName + '.disabled';
        }

        const newPath = path.join(modsPath, newName);
        await fs.rename(oldPath, newPath);
        return { success: true, newName };
    }

    private async deleteMod(instanceId: string, modName: string) {
        const modsPath = this.getModsPath(instanceId);
        const filePath = path.join(modsPath, modName);
        await fs.unlink(filePath);
        return { success: true };
    }
}
