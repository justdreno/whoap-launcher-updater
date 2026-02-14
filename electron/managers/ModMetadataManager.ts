import { ipcMain } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { ConfigManager } from './ConfigManager';

interface ModMetadata {
  projectId: string;
  versionId: string;
  versionNumber: string;
  filename: string;
  installedAt: string;
  gameVersion: string;
  loaders: string[];
}

interface ModsMetadata {
  mods: { [filename: string]: ModMetadata };
  resourcepacks: { [filename: string]: ModMetadata };
  shaderpacks: { [filename: string]: ModMetadata };
}

export class ModMetadataManager {
  private static handlersRegistered = false;

  constructor() {
    if (!ModMetadataManager.handlersRegistered) {
      this.registerListeners();
      ModMetadataManager.handlersRegistered = true;
    }
  }

  private registerListeners() {
    // Save metadata when installing
    ipcMain.handle('mods:save-metadata', async (_, instanceId: string, type: 'mod' | 'resourcepack' | 'shader', metadata: ModMetadata) => {
      try {
        await ModMetadataManager.saveMetadata(instanceId, type, metadata);
        return { success: true };
      } catch (error) {
        console.error('Failed to save mod metadata:', error);
        return { success: false, error: String(error) };
      }
    });

    // Get metadata for a specific file
    ipcMain.handle('mods:get-metadata', async (_, instanceId: string, type: 'mod' | 'resourcepack' | 'shader', filename: string) => {
      try {
        const metadata = await ModMetadataManager.getMetadata(instanceId, type, filename);
        return { success: true, metadata };
      } catch (error) {
        console.error('Failed to get mod metadata:', error);
        return { success: false, error: String(error) };
      }
    });

    // Get all metadata for instance
    ipcMain.handle('mods:get-all-metadata', async (_, instanceId: string) => {
      try {
        const metadata = await ModMetadataManager.getAllMetadata(instanceId);
        return { success: true, metadata };
      } catch (error) {
        console.error('Failed to get all mod metadata:', error);
        return { success: false, error: String(error) };
      }
    });

    // Check for updates
    ipcMain.handle('mods:check-updates', async (_, instanceId: string, type: 'mod' | 'resourcepack' | 'shader', projectId: string, currentVersionId: string) => {
      try {
        const updateInfo = await ModMetadataManager.checkForUpdate(instanceId, type, projectId, currentVersionId);
        return { success: true, ...updateInfo };
      } catch (error) {
        console.error('Failed to check for mod updates:', error);
        return { success: false, error: String(error) };
      }
    });

    // Find mod by project ID
    ipcMain.handle('mods:find-by-project', async (_, instanceId: string, type: 'mod' | 'resourcepack' | 'shader', projectId: string) => {
      try {
        const modInfo = await ModMetadataManager.findModByProjectId(instanceId, type, projectId);
        return { success: true, ...modInfo };
      } catch (error) {
        console.error('Failed to find mod by project ID:', error);
        return { success: false, error: String(error) };
      }
    });
  }

  private static getMetadataPath(instanceId: string): string {
    const instancesPath = ConfigManager.getInstancesPath();
    const instancePath = path.join(instancesPath, instanceId);
    return path.join(instancePath, '.whoap-mods.json');
  }

  private static async loadMetadata(instanceId: string): Promise<ModsMetadata> {
    const metadataPath = ModMetadataManager.getMetadataPath(instanceId);
    
    if (!existsSync(metadataPath)) {
      return { mods: {}, resourcepacks: {}, shaderpacks: {} };
    }

    try {
      const data = await fs.readFile(metadataPath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      console.error('Failed to load mod metadata:', e);
      return { mods: {}, resourcepacks: {}, shaderpacks: {} };
    }
  }

  private static async saveMetadataFile(instanceId: string, metadata: ModsMetadata): Promise<void> {
    const metadataPath = ModMetadataManager.getMetadataPath(instanceId);
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  static async saveMetadata(instanceId: string, type: 'mod' | 'resourcepack' | 'shader', metadata: ModMetadata): Promise<void> {
    const allMetadata = await ModMetadataManager.loadMetadata(instanceId);
    const category = type === 'mod' ? 'mods' : type === 'resourcepack' ? 'resourcepacks' : 'shaderpacks';
    
    allMetadata[category][metadata.filename] = metadata;
    await ModMetadataManager.saveMetadataFile(instanceId, allMetadata);
  }

  static async getMetadata(instanceId: string, type: 'mod' | 'resourcepack' | 'shader', filename: string): Promise<ModMetadata | null> {
    const allMetadata = await ModMetadataManager.loadMetadata(instanceId);
    const category = type === 'mod' ? 'mods' : type === 'resourcepack' ? 'resourcepacks' : 'shaderpacks';
    
    return allMetadata[category][filename] || null;
  }

  static async getAllMetadata(instanceId: string): Promise<ModsMetadata> {
    return ModMetadataManager.loadMetadata(instanceId);
  }

  static async findModByProjectId(instanceId: string, type: 'mod' | 'resourcepack' | 'shader', projectId: string): Promise<{ found: boolean; filename?: string; metadata?: ModMetadata }> {
    const allMetadata = await ModMetadataManager.loadMetadata(instanceId);
    const category = type === 'mod' ? 'mods' : type === 'resourcepack' ? 'resourcepacks' : 'shaderpacks';
    
    for (const [filename, metadata] of Object.entries(allMetadata[category])) {
      if (metadata.projectId === projectId) {
        return { found: true, filename, metadata };
      }
    }
    
    return { found: false };
  }

  static async checkForUpdate(instanceId: string, type: 'mod' | 'resourcepack' | 'shader', projectId: string, latestVersionId: string): Promise<{ 
    hasUpdate: boolean; 
    currentVersionId?: string; 
    currentFilename?: string;
    metadata?: ModMetadata 
  }> {
    const modInfo = await ModMetadataManager.findModByProjectId(instanceId, type, projectId);
    
    if (!modInfo.found) {
      return { hasUpdate: false };
    }

    const hasUpdate = modInfo.metadata!.versionId !== latestVersionId;
    
    return {
      hasUpdate,
      currentVersionId: modInfo.metadata!.versionId,
      currentFilename: modInfo.filename,
      metadata: modInfo.metadata
    };
  }

  static async removeMetadata(instanceId: string, type: 'mod' | 'resourcepack' | 'shader', filename: string): Promise<void> {
    const allMetadata = await ModMetadataManager.loadMetadata(instanceId);
    const category = type === 'mod' ? 'mods' : type === 'resourcepack' ? 'resourcepacks' : 'shaderpacks';
    
    delete allMetadata[category][filename];
    await ModMetadataManager.saveMetadataFile(instanceId, allMetadata);
  }
}
