import { ipcMain, BrowserWindow } from 'electron';
import { ModpackInstaller } from '../utils/ModpackInstaller';
import axios from 'axios';

const MODRINTH_API = 'https://api.modrinth.com/v2';
const USER_AGENT = 'YashinLauncher/1.0.0 (contact@yashin.app)';

export class ModpackManager {
    constructor() {
        this.registerListeners();
    }

    private registerListeners() {
        // Search Modpacks
        ipcMain.handle('modpack:search', async (_, query: string, options: {
            loader?: string;
            gameVersion?: string;
            index?: string;
            limit?: number;
            offset?: number;
        } = {}) => {
            try {
                const facets: string[][] = [['project_type:modpack']];

                if (options.loader) {
                    facets.push([`categories:${options.loader}`]);
                }
                if (options.gameVersion) {
                    facets.push([`versions:${options.gameVersion}`]);
                }

                const response = await axios.get(`${MODRINTH_API}/search`, {
                    params: {
                        query: query || '',
                        facets: JSON.stringify(facets),
                        index: options.index || 'relevance',
                        limit: options.limit || 20,
                        offset: options.offset || 0
                    },
                    headers: { 'User-Agent': USER_AGENT }
                });

                return {
                    success: true,
                    hits: response.data.hits,
                    total_hits: response.data.total_hits,
                    limit: response.data.limit,
                    offset: response.data.offset
                };
            } catch (error: any) {
                console.error('[ModpackManager] Search failed:', error.message);
                return { success: false, error: error.message };
            }
        });

        // Get Project Details
        ipcMain.handle('modpack:get-project', async (_, projectId: string) => {
            try {
                const response = await axios.get(`${MODRINTH_API}/project/${projectId}`, {
                    headers: { 'User-Agent': USER_AGENT }
                });
                return { success: true, project: response.data };
            } catch (error: any) {
                console.error('[ModpackManager] Get project failed:', error.message);
                return { success: false, error: error.message };
            }
        });

        // Get Versions
        ipcMain.handle('modpack:get-versions', async (_, projectId: string, options: {
            loaders?: string[];
            gameVersions?: string[];
        } = {}) => {
            try {
                const params: any = {};
                if (options.loaders?.length) {
                    params.loaders = JSON.stringify(options.loaders);
                }
                if (options.gameVersions?.length) {
                    params.game_versions = JSON.stringify(options.gameVersions);
                }

                const response = await axios.get(`${MODRINTH_API}/project/${projectId}/version`, {
                    params,
                    headers: { 'User-Agent': USER_AGENT }
                });
                return { success: true, versions: response.data };
            } catch (error: any) {
                console.error('[ModpackManager] Get versions failed:', error.message);
                return { success: false, error: error.message };
            }
        });

        // Install Modpack
        ipcMain.handle('modpack:install', async (event, data: {
            versionId: string;
            projectId: string;
            projectName: string;
            iconUrl?: string;
        }) => {
            try {
                console.log(`[ModpackManager] Installing ${data.projectName}...`);

                const win = BrowserWindow.fromWebContents(event.sender);
                const onProgress = (status: string, progress: number, total: number) => {
                    const percent = total > 0 ? Math.round((progress / total) * 100) : 0;
                    win?.webContents.send('modpack:install-progress', { status, progress: percent });
                };

                const result = await ModpackInstaller.installFromModrinth(
                    data.versionId,
                    data.projectId,
                    data.projectName,
                    data.iconUrl,
                    onProgress
                );

                return { success: true, instanceId: result.instanceId };
            } catch (error: any) {
                console.error('[ModpackManager] Install failed:', error.message);
                return { success: false, error: error.message };
            }
        });

        // Get featured/trending modpacks
        ipcMain.handle('modpack:get-featured', async () => {
            try {
                const response = await axios.get(`${MODRINTH_API}/search`, {
                    params: {
                        facets: JSON.stringify([['project_type:modpack']]),
                        index: 'downloads',
                        limit: 10
                    },
                    headers: { 'User-Agent': USER_AGENT }
                });
                return { success: true, hits: response.data.hits };
            } catch (error: any) {
                return { success: false, error: error.message };
            }
        });
    }
}
