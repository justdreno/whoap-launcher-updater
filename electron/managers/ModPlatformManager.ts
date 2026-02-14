import { ipcMain } from 'electron';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { InstanceManager } from './InstanceManager';
import { ConfigManager } from './ConfigManager';
import { ModMetadataManager } from './ModMetadataManager';

const API_BASE = 'https://api.modrinth.com/v2';
const USER_AGENT = 'WhoapLauncher/2.3.1 (contact@whoap.gg)'; // Replace with real contact if available

interface ModrinthProject {
    id: string; // Correct field name from API
    title: string;
    description: string;
    icon_url?: string;
    slug: string;
    author: string;
    downloads: number;
    follows: number;
    client_side: string;
    server_side: string;
}

interface ModrinthVersion {
    id: string;
    project_id: string;
    author_id: string;
    featured: boolean;
    name: string;
    version_number: string;
    game_versions: string[];
    loaders: string[];
    files: {
        hashes: { sha1: string; sha512: string };
        url: string;
        filename: string;
        primary: boolean;
        size: number;
    }[];
    dependencies: {
        version_id?: string;
        project_id?: string;
        file_name?: string;
        dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded';
    }[];
}

interface InstallStatus {
    modName: string;
    status: 'pending' | 'downloading' | 'installed' | 'skipped' | 'failed';
    error?: string;
}

export class ModPlatformManager {
    private static instance: ModPlatformManager;

    private constructor() {
        this.registerListeners();
    }

    public static getInstance(): ModPlatformManager {
        if (!ModPlatformManager.instance) {
            ModPlatformManager.instance = new ModPlatformManager();
        }
        return ModPlatformManager.instance;
    }

    private registerListeners() {
        // Generalized Search
        ipcMain.handle('platform:search', async (_, query: string, type: 'mod' | 'resourcepack' | 'shader', filters: { version: string; loader: string; offset?: number; limit?: number }) => {
            return await this.searchProject(query, type, filters);
        });

        // Generalized Versions
        ipcMain.handle('platform:get-versions', async (_, projectId: string, type: 'mod' | 'resourcepack' | 'shader', filters: { version: string; loader: string }) => {
            return await this.getProjectVersions(projectId, type, filters);
        });

        // Generalized Project Details
        ipcMain.handle('platform:get-projects', async (_, projectIds: string[]) => {
            return await this.getProjects(projectIds);
        });

        // Generalized Install
        ipcMain.handle('platform:install', async (event, instanceId: string, versionId: string, type: 'mod' | 'resourcepack' | 'shader' = 'mod') => {
            try {
                const results = await this.smartInstall(instanceId, versionId, type, (status) => {
                    event.sender.send('platform:install-progress', status);
                });
                return { success: true, results };
            } catch (error: any) {
                console.error("Smart install failed:", error);
                return { success: false, error: error.message };
            }
        });

        // Legacy compatibility for Mods
        ipcMain.handle('mods:search', async (_, query: string, filters: any) => this.searchProject(query, 'mod', filters));
        ipcMain.handle('mods:get-versions', async (_, pid: string, filters: any) => this.getProjectVersions(pid, 'mod', filters));
        ipcMain.handle('mods:get-projects', async (_, pids: string[]) => this.getProjects(pids));
        ipcMain.handle('mods:install', async (e, iid, vid) => {
            try {
                const results = await this.smartInstall(iid, vid, 'mod', (s) => e.sender.send('mods:install-progress', s));
                return { success: true, results };
            } catch (error: any) { return { success: false, error: error.message }; }
        });
    }

    private async searchProject(query: string, type: 'mod' | 'resourcepack' | 'shader', filters: { version: string; loader?: string; offset?: number; limit?: number }) {
        try {
            const facets: string[][] = [];

            // Project Type
            if (type === 'mod') facets.push(["project_type:mod"]);
            else if (type === 'resourcepack') facets.push(["project_type:resourcepack"]);
            else if (type === 'shader') facets.push(["project_type:shader"]);

            // Version
            if (filters.version) facets.push([`versions:${filters.version}`]);

            // Loader (Only for mods)
            if (type === 'mod' && filters.loader) {
                facets.push([`categories:${filters.loader}`]);
            }

            const response = await axios.get(`${API_BASE}/search`, {
                params: {
                    query,
                    facets: JSON.stringify(facets),
                    offset: filters.offset || 0,
                    limit: filters.limit || 20,
                    index: 'relevance'
                },
                headers: { 'User-Agent': USER_AGENT }
            });

            return response.data;
        } catch (error) {
            console.error("Modrinth search error:", error);
            throw error;
        }
    }

    private async getProjectVersions(projectId: string, type: 'mod' | 'resourcepack' | 'shader', filters: { version: string; loader?: string }) {
        try {
            const params: any = {};
            if (filters.version) params.game_versions = JSON.stringify([filters.version]);

            // Loader filter is only for mods
            if (type === 'mod' && filters.loader) {
                params.loaders = JSON.stringify([filters.loader]);
            }

            const response = await axios.get(`${API_BASE}/project/${projectId}/version`, {
                params,
                headers: { 'User-Agent': USER_AGENT }
            });
            return response.data as ModrinthVersion[];
        } catch (error) {
            console.error("Failed to fetch versions:", error);
            return [];
        }
    }

    public async getProjects(projectIds: string[]) {
        if (!projectIds || projectIds.length === 0) return [];
        try {
            const response = await axios.get(`${API_BASE}/projects`, {
                params: {
                    ids: JSON.stringify(projectIds)
                },
                headers: { 'User-Agent': USER_AGENT }
            });
            return response.data;
        } catch (error) {
            console.error("Failed to fetch projects:", error);
            return [];
        }
    }

    public async getVersion(versionId: string): Promise<ModrinthVersion> {
        const response = await axios.get(`${API_BASE}/version/${versionId}`, {
            headers: { 'User-Agent': USER_AGENT }
        });
        return response.data;
    }

    /**
     * Recursively resolves dependencies and installs them.
     */
    private async smartInstall(
        instanceId: string,
        rootVersionId: string,
        type: 'mod' | 'resourcepack' | 'shader',
        progressCallback: (status: InstallStatus) => void
    ): Promise<InstallStatus[]> {
        const instancePath = path.join(ConfigManager.getInstancesPath(), instanceId);

        let targetDirName = 'mods';
        if (type === 'resourcepack') targetDirName = 'resourcepacks';
        else if (type === 'shader') targetDirName = 'shaderpacks';

        const targetDir = path.join(instancePath, targetDirName);
        await fs.mkdir(targetDir, { recursive: true });

        const installed = new Set<string>();
        const installQueue: ModrinthVersion[] = [];

        // 1. Resolve Phase
        const resolve = async (vId: string) => {
            progressCallback({ modName: 'Resolving dependencies...', status: 'pending' });

            try {
                const version = await this.getVersion(vId);

                if (installed.has(version.project_id)) return;
                installed.add(version.project_id);

                installQueue.push(version);

                // Check dependencies (Only recursive for mods)
                if (type === 'mod') {
                    for (const dep of version.dependencies) {
                        if (dep.dependency_type === 'required') {
                            if (dep.version_id) {
                                await resolve(dep.version_id);
                            } else if (dep.project_id) {
                                const bestDepVersion = await this.findCompatibleVersion(dep.project_id, version.game_versions[0], version.loaders[0]);
                                if (bestDepVersion) {
                                    await resolve(bestDepVersion.id);
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error(`Failed to resolve version ${vId}`, e);
            }
        };

        await resolve(rootVersionId);

        // 2. Install Phase
        const results: InstallStatus[] = [];
        
        for (const ver of installQueue) {
            const primaryFile = ver.files.find(f => f.primary) || ver.files[0];
            const destPath = path.join(targetDir, primaryFile.filename);

            try {
                await fs.access(destPath);
                results.push({ modName: ver.name, status: 'skipped' });
                progressCallback({ modName: ver.name, status: 'skipped' });
            } catch {
                progressCallback({ modName: ver.name, status: 'downloading' });
                try {
                    const response = await axios.get(primaryFile.url, { responseType: 'stream' });
                    await pipeline(response.data, createWriteStream(destPath));
                    
                    // Save metadata for tracking
                    await ModMetadataManager.saveMetadata(instanceId, type, {
                        projectId: ver.project_id,
                        versionId: ver.id,
                        versionNumber: ver.version_number,
                        filename: primaryFile.filename,
                        installedAt: new Date().toISOString(),
                        gameVersion: ver.game_versions[0],
                        loaders: ver.loaders
                    });
                    
                    results.push({ modName: ver.name, status: 'installed' });
                    progressCallback({ modName: ver.name, status: 'installed' });
                } catch (e: any) {
                    results.push({ modName: ver.name, status: 'failed', error: e.message });
                    progressCallback({ modName: ver.name, status: 'failed', error: e.message });
                }
            }
        }
        return results;
    }

    private async findCompatibleVersion(projectId: string, gameVersion: string, loader: string): Promise<ModrinthVersion | null> {
        const versions = await this.getProjectVersions(projectId, 'mod', { version: gameVersion, loader });
        return versions.length > 0 ? versions[0] : null;
    }
}
