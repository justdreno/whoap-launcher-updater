import axios from 'axios';

const API_BASE = 'https://api.curseforge.com/v1';

export interface CurseForgeFile {
    id: number;
    displayName: string;
    fileName: string;
    downloadUrl: string;
    fileLength: number;
    gameVersions: string[];
}

export class CurseForgeApi {
    private static getApiKey(): string {
        return process.env.CURSEFORGE_API_KEY || '';
    }

    /**
     * Get file information including download URL for a specific fileID
     */
    static async getFileInfo(projectId: number, fileId: number): Promise<CurseForgeFile> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('CurseForge API Key is missing. Please add CURSEFORGE_API_KEY to your environment/settings.');
        }

        try {
            const response = await axios.get(`${API_BASE}/mods/${projectId}/files/${fileId}`, {
                headers: {
                    'x-api-key': apiKey
                }
            });
            return response.data.data;
        } catch (error: any) {
            if (error.response?.status === 403) {
                throw new Error('CurseForge API Key is invalid or blocked (403).');
            }
            console.error('[CurseForgeApi] Failed to get file info:', error);
            throw error;
        }
    }

    /**
     * Batch get file information
     */
    static async getFilesInfo(fileIds: number[]): Promise<CurseForgeFile[]> {
        const apiKey = this.getApiKey();
        if (!apiKey) {
            throw new Error('CurseForge API Key is missing. Please add CURSEFORGE_API_KEY to your environment/settings.');
        }

        try {
            const response = await axios.post(`${API_BASE}/mods/files`, {
                fileIds
            }, {
                headers: {
                    'x-api-key': apiKey,
                    'Content-Type': 'application/json'
                }
            });
            return response.data.data;
        } catch (error: any) {
            if (error.response?.status === 403) {
                throw new Error('CurseForge API Key is invalid or blocked (403).');
            }
            console.error('[CurseForgeApi] Failed to get files info:', error);
            throw error;
        }
    }

    /**
     * Resolve download URL for a file
     * Note: CurseForge API sometimes returns null for downloadUrl if the mod author disabled third-party downloads.
     * In that case, we might need a workaround or warn the user.
     */
    static getDownloadUrl(file: CurseForgeFile): string {
        if (file.downloadUrl) return file.downloadUrl;

        // Fallback for some mods: https://edge.forgecdn.net/files/<ID_PART_1>/<ID_PART_2>/<FILENAME>
        // But this is not always reliable. Better to use the official API's downloadUrl if available.
        // For projectID/fileID based resolution:
        const fileIdStr = file.id.toString();
        const part1 = fileIdStr.substring(0, 4);
        const part2 = fileIdStr.substring(4);
        return `https://edge.forgecdn.net/files/${part1}/${part2}/${encodeURIComponent(file.fileName)}`;
    }
}
