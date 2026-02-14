import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import AdmZip from 'adm-zip';
import { AssetDownloader } from './AssetDownloader';
import axios from 'axios';
import { ConfigManager } from '../managers/ConfigManager';

// Map Java major version to download URLs
const JAVA_DOWNLOADS: Record<string, string> = {
    '8': 'https://api.adoptium.net/v3/binary/latest/8/ga/windows/x64/jdk/hotspot/normal/eclipse',
    '17': 'https://api.adoptium.net/v3/binary/latest/17/ga/windows/x64/jdk/hotspot/normal/eclipse',
    '21': 'https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse',
};

export class JavaManager {
    private javaPath: string;
    private downloader: AssetDownloader;

    constructor() {
        this.javaPath = path.join(ConfigManager.getDataPath(), 'runtimes');
        this.downloader = new AssetDownloader();
        if (!fs.existsSync(this.javaPath)) {
            fs.mkdirSync(this.javaPath, { recursive: true });
        }
    }

    async ensureJava(
        majorVersion: string,
        onProgress?: (status: string, progress: number) => void,
        onConfirm?: (version: string, size: number) => Promise<'install' | 'skip' | 'cancel'>
    ): Promise<string> {
        // 1. Check if we already downloaded it
        const targetDir = path.join(this.javaPath, `java-${majorVersion}`);
        const cachedJava = this.findJavaBinary(targetDir);
        if (cachedJava) {
            console.log(`[Java] Found cached Java ${majorVersion} at ${cachedJava}`);
            return cachedJava;
        }

        // 2. Check System Java
        if (onProgress) onProgress(`Checking system for Java ${majorVersion}...`, 10);

        const systemJava = await this.detectSystemJava(majorVersion);
        if (systemJava) {
            if (onProgress) onProgress(`Found Java ${majorVersion}`, 100);
            return systemJava;
        }

        // 3. Download if missing
        console.log(`[Java] Java ${majorVersion} missing.`);

        const url = JAVA_DOWNLOADS[majorVersion];
        if (!url) throw new Error(`Unsupported Java version: ${majorVersion}`);

        // Get size
        let size = 0;
        try {
            const headRes = await axios.head(url);
            size = parseInt(headRes.headers['content-length'] || '0');
            console.log(`[JavaManager] Detected size for ${majorVersion}: ${size} bytes`);
        } catch (e) {
            console.warn("Failed to get Java download size", e);
        }

        // 4. Ask for Permission
        // 4. Ask for Permission
        if (onConfirm) {
            const action = await onConfirm(majorVersion, size);
            if (action === 'cancel') {
                throw new Error("Java installation cancelled by user");
            }
            if (action === 'skip') {
                console.warn(`[Java] User skipped installation for Java ${majorVersion}. Attempting to proceed...`);
                return 'java'; // Fallback to system java (hope for best) or just return a dummy path? 
                // Return 'java' assumes it's in path, or let the game fail later if it's truly missing.
            }
        }

        console.log(`[Java] Downloading...`);
        return await this.downloadJava(majorVersion, targetDir, size, onProgress);
    }

    private findJavaBinary(root: string): string | null {
        if (!fs.existsSync(root)) return null;

        // Direct check
        const directBin = path.join(root, 'bin', 'java.exe');
        if (fs.existsSync(directBin)) return directBin;

        // Nested check
        try {
            const files = fs.readdirSync(root);
            for (const file of files) {
                const nested = path.join(root, file, 'bin', 'java.exe');
                if (fs.existsSync(nested)) return nested;
            }
        } catch { }

        return null;
    }

    private async downloadJava(version: string, targetDir: string, totalSize: number, onProgress?: (status: string, progress: number) => void): Promise<string> {
        const url = JAVA_DOWNLOADS[version]; // Already validated in ensureJava
        const zipPath = path.join(this.javaPath, `temp-${version}.zip`);

        // Download
        console.log(`[Java] Downloading from ${url}`);

        await new Promise<void>((resolve, reject) => {
            // Get size for progress calculation
            // Pass size if we had it, but AssetDownloader recalculates or updates

            this.downloader.addToQueue([{
                url,
                destination: zipPath,
                priority: 100,
                size: totalSize
            }]);

            this.downloader.on('done', resolve);
            this.downloader.on('error', reject);

            let lastUpdate = 0;
            const progressListener = (p: any) => {
                const now = Date.now();
                if (now - lastUpdate > 100) {
                    // Need to calculate percentage relative to this file only? 
                    // AssetDownloader emits global progress for queue.
                    // The p object has { total, current }

                    const totalMB = (p.total / 1024 / 1024).toFixed(1);
                    const currentMB = (p.current / 1024 / 1024).toFixed(1);
                    const percent = p.total > 0 ? (p.current / p.total) * 100 : 0;

                    if (onProgress) onProgress(`Downloading Java ${version} (${currentMB}/${totalMB} MB)...`, percent);

                    // Also dispatch granular event for the modal if needed via onProgress?
                    // Currently onProgress is passed from LaunchProcess which sends 'launch:progress'
                    // The Modal listens to 'java-install-progress'. We might need to handle that mapping in LaunchProcess.
                    lastUpdate = now;
                }
            };

            this.downloader.on('progress', progressListener);

            // Cleanup listener on finish to avoid leaks if reusing downloader?
            // AssetDownloader is one-off per JavaManager? No, reused.
            // We should use 'once' for done/error but 'on' for progress, and remove listeners.
            // Simplified for now assuming sequential operations or single active Java download.
        });

        // Extract
        console.log(`[Java] Extracting to ${targetDir}...`);
        if (onProgress) onProgress(`Extracting Java ${version}...`, 100); // 100% download, extracting

        try {
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(targetDir, true);
        } catch (e) {
            throw new Error(`Failed to extract Java: ${e}`);
        } finally {
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
        }

        const bin = this.findJavaBinary(targetDir);
        if (!bin) throw new Error("Java installed but executable not found.");

        return bin;
    }

    private async detectSystemJava(majorVersion: string): Promise<string | null> {
        if (await this.checkJavaVersion('java', majorVersion)) {
            console.log(`[Java] System 'java' command matches version ${majorVersion}`);
            return 'java';
        }

        const scanRoots = [
            `C:\\Program Files\\Java`,
            `C:\\Program Files\\Eclipse Adoptium`,
            path.join(ConfigManager.getDataPath(), '../.minecraft/runtime'),
            path.join(ConfigManager.getDataPath(), '../.tlauncher/jvms'),
            path.join(ConfigManager.getDataPath(), '../.curseforge/minecraft/Install/runtime'),
        ];

        console.log(`[Java] Scanning system for Java ${majorVersion}...`);

        for (const root of scanRoots) {
            if (!fs.existsSync(root)) continue;

            try {
                const subdirs = fs.readdirSync(root);
                for (const dir of subdirs) {
                    const fullDir = path.join(root, dir);
                    const possibleBins = [
                        path.join(fullDir, 'bin', 'java.exe'),
                        path.join(fullDir, 'java-runtime-gamma', 'bin', 'java.exe'),
                        path.join(fullDir, 'windows-x64', 'java-runtime-gamma', 'bin', 'java.exe'),
                    ];

                    for (const attemptBin of possibleBins) {
                        if (fs.existsSync(attemptBin)) {
                            if (await this.checkJavaVersion(attemptBin, majorVersion)) {
                                return attemptBin;
                            }
                        }
                    }
                }
            } catch (e) { }
        }

        return null;
    }

    private checkJavaVersion(bin: string, requiredMajor: string): Promise<boolean> {
        return new Promise((resolve) => {
            const proc = spawn(bin, ['-version']);
            let output = '';
            proc.stderr.on('data', (d) => output += d.toString());
            proc.stdout.on('data', (d) => output += d.toString());

            proc.on('error', () => resolve(false));
            proc.on('close', () => {
                if (output.includes(`version "${requiredMajor}`)) return resolve(true);
                if (requiredMajor === '8' && output.includes('version "1.8')) return resolve(true);

                const vMatch = output.match(/version "(\d+)\.(\d+)/);
                if (vMatch) {
                    const major = vMatch[1] === '1' ? vMatch[2] : vMatch[1];
                    if (major === requiredMajor) return resolve(true);
                }
                resolve(false);
            });
        });
    }
}
