import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import axios from 'axios';
import AdmZip from 'adm-zip';
import { CurseForgeApi } from '../api/CurseForgeApi';
import { ConfigManager } from '../managers/ConfigManager';
import { randomUUID } from 'crypto';

export class ModpackInstaller {
    private static instancesDir = path.join(ConfigManager.getDataPath(), 'instances');

    static async installFromModrinth(
        versionId: string,
        projectId: string,
        projectName: string,
        iconUrl: string | undefined,
        onProgress: (status: string, progress: number, total: number) => void
    ) {
        console.log(`[ModpackInstaller] Starting install for ${projectName} (Version: ${versionId})`);

        try {
            onProgress("Fetching version details...", 0, 100);
            const versionData = await axios.get(`https://api.modrinth.com/v2/version/${versionId}`, {
                headers: { 'User-Agent': 'WhoapLauncher/1.0' }
            });
            const files = versionData.data.files;
            const primary = files.find((f: any) => f.primary) || files[0];

            if (!primary || !primary.url.endsWith('.mrpack')) {
                throw new Error("No .mrpack file found for this version.");
            }

            // Setup Instance Paths
            const safeName = projectName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
            let instanceDir = path.join(this.instancesDir, safeName);
            let counter = 1;
            while (fs.existsSync(instanceDir)) {
                instanceDir = path.join(this.instancesDir, `${safeName}_${counter}`);
                counter++;
            }
            fs.mkdirSync(instanceDir, { recursive: true });

            // Download .mrpack
            onProgress("Downloading modpack configuration...", 10, 100);
            console.log(`[ModpackInstaller] Downloading .mrpack from ${primary.url}`);
            const packPath = path.join(instanceDir, 'modpack.mrpack');
            await this.downloadFile(primary.url, packPath);

            const result = await this.installFromLocalZip(packPath, onProgress, projectName, iconUrl);

            // Clean up the downloaded pack
            if (fs.existsSync(packPath)) fs.unlinkSync(packPath);

            return result;

        } catch (error) {
            console.error(`[ModpackInstaller] Error:`, error);
            throw error;
        }
    }

    /**
     * Install from a local ZIP / .mrpack file
     */
    static async installFromLocalZip(
        zipPath: string,
        onProgress: (status: string, progress: number, total: number) => void,
        providedName?: string,
        providedIcon?: string
    ) {
        console.log(`[ModpackInstaller] Installing from local zip: ${zipPath}`);

        try {
            onProgress("Analyzing zip content...", 5, 100);
            const zip = new AdmZip(zipPath);
            const entries = zip.getEntries();

            const isModrinth = entries.some(e => e.entryName === 'modrinth.index.json');
            const isCurseForge = entries.some(e => e.entryName === 'manifest.json');

            if (!isModrinth && !isCurseForge) {
                throw new Error("Invalid modpack: No Modrinth or CurseForge manifest found inside zip.");
            }

            // Setup Instance Paths
            let projectName = providedName || path.basename(zipPath, path.extname(zipPath));
            const safeName = projectName.replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_');
            let instanceDir = path.join(this.instancesDir, safeName);
            let counter = 1;
            while (fs.existsSync(instanceDir)) {
                instanceDir = path.join(this.instancesDir, `${safeName}_${counter}`);
                counter++;
            }
            fs.mkdirSync(instanceDir, { recursive: true });

            onProgress("Extracting overrides...", 10, 100);
            zip.extractAllTo(instanceDir, true);

            let gameVersion = '';
            let loader = 'vanilla';
            let loaderVersion = '';
            let filesToDownload: { url: string, path: string, fileSize?: number }[] = [];

            if (isModrinth) {
                onProgress("Parsing Modrinth manifest...", 15, 100);
                const indexPath = path.join(instanceDir, 'modrinth.index.json');
                const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));

                projectName = providedName || indexData.name || projectName;
                gameVersion = indexData.dependencies.minecraft;

                const deps = indexData.dependencies;
                loader = (deps['fabric-loader'] || deps.fabric_loader) ? 'fabric' :
                    (deps.forge ? 'forge' :
                        (deps.neoforge ? 'neoforge' :
                            ((deps['quilt-loader'] || deps.quilt_loader) ? 'quilt' : 'vanilla')));
                loaderVersion = deps[`${loader}-loader`] || deps[`${loader}_loader`] || deps[loader];

                filesToDownload = indexData.files.map((f: any) => ({
                    url: f.downloads[0],
                    path: f.path,
                    fileSize: f.fileSize
                }));

                // Handle Overrides
                const overridesDir = path.join(instanceDir, 'overrides');
                if (fs.existsSync(overridesDir)) this.copyRecursiveSync(overridesDir, instanceDir);
                const clientOverridesDir = path.join(instanceDir, 'client-overrides');
                if (fs.existsSync(clientOverridesDir)) this.copyRecursiveSync(clientOverridesDir, instanceDir);

            } else if (isCurseForge) {
                onProgress("Parsing CurseForge manifest...", 15, 100);
                const manifestPath = path.join(instanceDir, 'manifest.json');
                const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

                projectName = providedName || manifest.name || projectName;
                gameVersion = manifest.minecraft.version;

                const loaders = manifest.minecraft.modLoaders;
                if (loaders && loaders.length > 0) {
                    const primaryLoader = loaders[0].id; // e.g. "forge-47.2.0" or "fabric-0.14.22"
                    if (primaryLoader.includes('fabric')) {
                        loader = 'fabric';
                        loaderVersion = primaryLoader.replace('fabric-', '');
                    } else if (primaryLoader.includes('forge')) {
                        loader = 'forge';
                        loaderVersion = primaryLoader.replace('forge-', '');
                    } else if (primaryLoader.includes('neoforge')) {
                        loader = 'neoforge';
                        loaderVersion = primaryLoader.replace('neoforge-', '');
                    } else if (primaryLoader.includes('quilt')) {
                        loader = 'quilt';
                        loaderVersion = primaryLoader.replace('quilt-', '');
                    }
                }

                onProgress("Resolving CurseForge mod URLs...", 20, 100);
                const cfFiles = manifest.files; // { projectID, fileID, required }

                // Optimized CF resolution
                const fileIds = cfFiles.map((f: any) => f.fileID);
                // The CF API supports batching file lookups.
                const resolvedFiles = await CurseForgeApi.getFilesInfo(fileIds);

                filesToDownload = resolvedFiles.map(file => ({
                    url: CurseForgeApi.getDownloadUrl(file),
                    path: path.join('mods', file.fileName),
                    fileSize: file.fileLength
                }));

                // Handle Overrides
                const overridesDir = path.join(instanceDir, manifest.overrides || 'overrides');
                if (fs.existsSync(overridesDir)) {
                    this.copyRecursiveSync(overridesDir, instanceDir);
                }
            }

            // Download Logic
            const totalFiles = filesToDownload.length;
            const totalBytes = filesToDownload.reduce((acc, f) => acc + (f.fileSize || 0), 0);
            const totalMB = (totalBytes / 1024 / 1024).toFixed(1);

            const CONCURRENCY = 5;
            let completed = 0;
            let bytesDownloaded = 0;
            const downloadQueue = [...filesToDownload];
            const activeWorkers = [];

            const downloadWorker = async () => {
                while (downloadQueue.length > 0) {
                    const file = downloadQueue.shift();
                    if (!file) break;

                    const destPath = path.join(instanceDir, file.path);
                    const destFolder = path.dirname(destPath);
                    if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });

                    try {
                        await this.downloadFile(file.url, destPath);
                        completed++;
                        bytesDownloaded += (file.fileSize || 0);

                        const overallPercent = 30 + Math.floor((completed / totalFiles) * 60);

                        let infoStr = `Downloading files: ${completed}/${totalFiles}`;
                        if (totalBytes > 0) {
                            infoStr += ` (${(bytesDownloaded / 1024 / 1024).toFixed(1)}/${totalMB} MB)`;
                        }

                        onProgress(infoStr, overallPercent, 100);
                    } catch (err) {
                        console.error(`Failed to download ${file.path}`, err);
                    }
                }
            };

            for (let i = 0; i < CONCURRENCY; i++) activeWorkers.push(downloadWorker());
            await Promise.all(activeWorkers);

            // Install Loader
            let launchVersionId = gameVersion;
            if (loader === 'fabric' || loader === 'quilt') {
                try {
                    onProgress(`Installing ${loader} loader...`, 90, 100);
                    const metaHost = loader === 'fabric' ? 'https://meta.fabricmc.net/v2' : 'https://meta.quiltmc.org/v3';

                    if (!loaderVersion) {
                        const vRes = await axios.get(`${metaHost}/versions/loader/${gameVersion}`);
                        const best = vRes.data.find((l: any) => l.loader.stable) || vRes.data[0];
                        if (best) loaderVersion = best.loader.version;
                    }

                    if (loaderVersion) {
                        const profileUrl = `${metaHost}/versions/loader/${gameVersion}/${loaderVersion}/profile/json`;
                        const profileRes = await axios.get(profileUrl);
                        const profileJson = profileRes.data;

                        const versionId = profileJson.id;
                        const gamePath = ConfigManager.getGamePath();
                        const versionDir = path.join(gamePath, 'versions', versionId);

                        if (!fs.existsSync(versionDir)) {
                            fs.mkdirSync(versionDir, { recursive: true });
                            fs.writeFileSync(path.join(versionDir, `${versionId}.json`), JSON.stringify(profileJson, null, 4));
                        }
                        launchVersionId = versionId;
                    }
                } catch (e) {
                    console.error("Failed to install loader", e);
                }
            }

            const instanceConfig = {
                id: path.basename(instanceDir),
                name: projectName,
                version: gameVersion,
                loader: loader,
                loaderVersion: loaderVersion,
                launchVersionId: launchVersionId,
                icon: providedIcon,
                created: Date.now(),
                lastPlayed: 0,
                memory: 4096
            };

            fs.writeFileSync(path.join(instanceDir, 'instance.json'), JSON.stringify(instanceConfig, null, 4));

            // Clean up manifests to keep it clean
            const toCleanup = ['modrinth.index.json', 'manifest.json', 'overrides', 'client-overrides', 'modpack.mrpack'];
            toCleanup.forEach(f => {
                const p = path.join(instanceDir, f);
                if (fs.existsSync(p)) {
                    if (fs.statSync(p).isDirectory()) fs.rmSync(p, { recursive: true, force: true });
                    else fs.unlinkSync(p);
                }
            });

            onProgress("Complete!", 100, 100);
            return { success: true, instanceId: instanceConfig.id };

        } catch (error: any) {
            console.error(`[ModpackInstaller] Local Zip Install Error:`, error);
            throw error;
        }
    }

    private static async downloadFile(url: string, dest: string) {
        const writer = fs.createWriteStream(dest);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
            headers: {
                'User-Agent': 'WhoapLauncher/1.0'
            }
        });
        response.data.pipe(writer);
        return new Promise<void>((resolve, reject) => {
            writer.on('finish', () => resolve());
            writer.on('error', reject);
        });
    }

    private static copyRecursiveSync(src: string, dest: string) {
        if (!fs.existsSync(src)) return;
        const stats = fs.statSync(src);
        if (stats && stats.isDirectory()) {
            if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
            const items = fs.readdirSync(src);
            for (const childItemName of items) {
                this.copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
            }
        } else if (stats) {
            const destDir = path.dirname(dest);
            if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
            fs.copyFileSync(src, dest);
        }
    }
}
