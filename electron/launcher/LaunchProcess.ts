import { app, ipcMain, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';
import { AssetDownloader, DownloadTask } from './AssetDownloader';
import { JavaManager } from './JavaManager';
import { spawn } from 'child_process';
import { VersionManager } from './VersionManager';
import { ConfigManager } from '../managers/ConfigManager';
import { LogWindowManager } from '../managers/LogWindowManager';
import { CloudManager } from '../managers/CloudManager';
import { DiscordManager } from '../managers/DiscordManager';
import { InstanceManager } from '../managers/InstanceManager';

export class LaunchProcess {
    private downloader: AssetDownloader;
    private javaManager: JavaManager;

    constructor() {
        this.downloader = new AssetDownloader();
        this.javaManager = new JavaManager();
        this.registerListeners();
    }

    private registerListeners() {
        ipcMain.handle('game:launch', async (event, instanceId: string, _unusedPath: string, versionId: string, authData: any) => {
            // Trigger Cloud Sync
            try {
                // Construct synthetic instance object for sync
                // We don't have full loader info here easily unless we fetch it, 
                // but for imported versions 'vanilla' is safe default.
                // Native instances logic should ideally read their json, but for speed we sync what we launched.
                const instanceObj = {
                    id: instanceId,
                    name: instanceId,
                    version: versionId,
                    loader: 'vanilla' as const, // Approximation
                    created: Date.now(),
                    lastPlayed: Date.now()
                };

                // Fire and forget sync
                // Note: authData.token is likely the Microsoft/Supabase token depending on login type.
                // Verify we have a valid Supabase session token, or skip.
                // We assume if authData.type === 'supabase', token is valid for RLS.
                // If authData.type === 'mojang' or 'offline', we likely CANNOT sync to RLS tables.

                if (authData.type === 'supabase') {
                    CloudManager.getInstance().syncInstance(instanceObj, authData.uuid, authData.token);
                }
            } catch (e) {
                console.error("[Launch] Failed to trigger cloud sync", e);
            }

            // Update Discord Presence
            DiscordManager.getInstance().setLaunchingPresence(instanceId, versionId);

            // Window Management
            const mainWindow = BrowserWindow.fromWebContents(event.sender);

            const gamePath = ConfigManager.getGamePath();
            const instancesRoot = ConfigManager.getInstancesPath();

            // Determine if this is a native instance or imported
            const instanceRootPath = path.join(instancesRoot, instanceId);
            let isNativeInstance = fs.existsSync(instanceRootPath);
            let useExternalPath = false;

            if (isNativeInstance) {
                const configPath = path.join(instanceRootPath, 'instance.json');
                if (fs.existsSync(configPath)) {
                    try {
                        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                        if (config.useExternalPath) {
                            useExternalPath = true;
                        }
                    } catch (e) {
                        console.error("[Launch] Failed to read instance config", e);
                    }
                }
            }

            // For TLauncher/custom versions, check if the version folder has mods/configs
            // If so, use the version folder as gameDir (TLauncher's "version isolation" behavior)
            const versionFolder = path.join(gamePath, 'versions', versionId);
            const versionHasMods = fs.existsSync(path.join(versionFolder, 'mods'));
            const versionHasConfig = fs.existsSync(path.join(versionFolder, 'config'));
            const versionHasCustomContent = versionHasMods || versionHasConfig;

            // Determine game directory:
            // - Native Instance (useExternalPath: true) -> Use version folder
            // - Native Instance -> Isolated in instances/<id>
            // - Imported Version WITH mods/config -> Use version folder (TLauncher style)
            // - Imported Version without custom content -> Use shared .minecraft
            let instancePath = (isNativeInstance && !useExternalPath)
                ? instanceRootPath
                : (useExternalPath || versionHasCustomContent ? versionFolder : gamePath);

            try {
                // Load instance config for custom settings
                let instanceConfig: any = null;
                const instanceConfigPath = path.join(instanceRootPath, 'instance.json');
                if (isNativeInstance && fs.existsSync(instanceConfigPath)) {
                    try {
                        instanceConfig = JSON.parse(fs.readFileSync(instanceConfigPath, 'utf8'));
                        console.log("[Launch] Loaded instance config:", instanceConfig.id);
                    } catch (e) {
                        console.warn("[Launch] Failed to read instance config", e);
                    }
                }

                // 1. Fetch Version Data
                let versionData: any = null;

                // Check for custom version JSON first (custom clients)
                if (instanceConfig?.customVersionJson && fs.existsSync(instanceConfig.customVersionJson)) {
                    console.log("[Launch] Loading custom version JSON:", instanceConfig.customVersionJson);
                    try {
                        versionData = JSON.parse(fs.readFileSync(instanceConfig.customVersionJson, 'utf-8'));
                    } catch (e) {
                        console.error("[Launch] Failed to parse custom version JSON", e);
                    }
                }

                // Try remote if no custom JSON
                if (!versionData) {
                    try {
                        versionData = await VersionManager.getVersionDetails(versionId);
                    } catch (e) {
                        console.warn("[Launch] Failed to fetch remote version details, falling back to local:", e);
                    }
                }

                // Fallback: Local JSON in versions folder
                if (!versionData) {
                    const localJsonPath = path.join(gamePath, 'versions', versionId, `${versionId}.json`);
                    if (fs.existsSync(localJsonPath)) {
                        console.log("Loading local version JSON...");
                        try {
                            versionData = JSON.parse(fs.readFileSync(localJsonPath, 'utf-8'));
                        } catch (e) {
                            console.error("Failed to parse local JSON", e);
                        }
                    }
                }

                if (!versionData) throw new Error("Could not fetch or find version details");

                // Helper to deduplicate libraries by artifact ID
                const deduplicateLibraries = (libs: any[]) => {
                    const libMap = new Map<string, any>();

                    libs.forEach(lib => {
                        if (!lib.name) return; // Should not happen for standard libraries

                        // Parse "group:artifact:version:classifier"
                        const parts = lib.name.split(':');
                        if (parts.length < 3) return;

                        // IDKey = group:artifact[:classifier]
                        // We must preserve natives/classifiers, but deduplicate versions of the same artifact.
                        let key = `${parts[0]}:${parts[1]}`;
                        if (parts.length > 3) {
                            key += `:${parts[3]}`;
                        }

                        // Overwrite with latest
                        libMap.set(key, lib);
                    });

                    return Array.from(libMap.values());
                };

                // Resolve Inheritance (e.g. Fabric -> Vanilla)
                // We do this concurrently to ensure we have all data (libraries, client jar, etc.)
                const resolveInheritance = async (data: any): Promise<any> => {
                    if (data.inheritsFrom) {
                        let parentData = await VersionManager.getVersionDetails(data.inheritsFrom);

                        if (!parentData) {
                            const parentLocalPath = path.join(gamePath, 'versions', data.inheritsFrom, `${data.inheritsFrom}.json`);
                            if (fs.existsSync(parentLocalPath)) {
                                try { parentData = JSON.parse(fs.readFileSync(parentLocalPath, 'utf-8')); } catch { }
                            }
                        }

                        if (parentData) {
                            parentData = await resolveInheritance(parentData); // Recursive

                            // Merge and Deduplicate Libraries
                            const allLibraries = [...(parentData.libraries || []), ...(data.libraries || [])];
                            const uniqueLibraries = deduplicateLibraries(allLibraries);

                            const merged = {
                                ...parentData,
                                ...data, // Child overrides parent
                                libraries: uniqueLibraries,
                                arguments: { // Merge args complex object
                                    game: [...(parentData.arguments?.game || []), ...(data.arguments?.game || [])],
                                    jvm: [...(parentData.arguments?.jvm || []), ...(data.arguments?.jvm || [])]
                                }
                            };
                            return merged;
                        } else {
                            console.error(`[Launch] Failed to find parent version ${data.inheritsFrom}!`);
                            throw new Error(`Parent version ${data.inheritsFrom} not found/resolved. Cannot launch.`);
                        }
                    } else {
                        console.log(`[Launch] No inheritance for ${data.id}`);
                    }
                    return data;
                };

                versionData = await resolveInheritance(versionData);

                // Reuse shared folders
                const librariesDir = path.join(gamePath, 'libraries');
                const assetsDir = path.join(gamePath, 'assets');
                // For imported versions, natives go to versions/<ver>/natives
                // For instances, they go to instances/<id>/natives
                const nativesDir = isNativeInstance
                    ? path.join(instancePath, 'natives')
                    : path.join(gamePath, 'versions', versionId, 'natives');

                // Client JAR
                let clientJarPath: string;
                let clientJarUrl = versionData.downloads?.client?.url;
                let clientJarSha1 = versionData.downloads?.client?.sha1;
                let clientJarSize = versionData.downloads?.client?.size;

                // Check for custom client jar first
                if (instanceConfig?.customClientJar && fs.existsSync(instanceConfig.customClientJar)) {
                    console.log(`[Launch] Using custom client JAR: ${instanceConfig.customClientJar}`);
                    clientJarPath = instanceConfig.customClientJar;
                    // Clear download info since we have the jar locally
                    clientJarUrl = undefined;
                    clientJarSha1 = undefined;
                    clientJarSize = undefined;
                } else {
                    const sharedJarPath = path.join(gamePath, 'versions', versionId, `${versionId}.jar`);
                    const instanceJarPath = path.join(instancesRoot, instanceId, 'client.jar');
                    
                    clientJarPath = isNativeInstance ? instanceJarPath : sharedJarPath;

                    // If utilizing shared JAR and it exists, prefer it
                    if (!isNativeInstance && fs.existsSync(sharedJarPath)) {
                        clientJarPath = sharedJarPath;
                    } else if (!clientJarUrl && fs.existsSync(sharedJarPath)) {
                        // Fallback if no URL but file exists (custom versions)
                        clientJarPath = sharedJarPath;
                    }
                }

                // Ensure directories
                if (!fs.existsSync(librariesDir)) fs.mkdirSync(librariesDir, { recursive: true });
                if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });
                if (!fs.existsSync(nativesDir)) fs.mkdirSync(nativesDir, { recursive: true });

                // 2. Queue Downloads
                const downloads: DownloadTask[] = [];

                // 2.1 Download Asset Index and Assets
                const assetIndexId = versionData.assetIndex?.id || versionData.assets || 'legacy';
                const assetIndexUrl = versionData.assetIndex?.url;
                const assetIndexPath = path.join(assetsDir, 'indexes', `${assetIndexId}.json`);

                if (assetIndexUrl) {
                    // Ensure indexes directory exists
                    const indexesDir = path.join(assetsDir, 'indexes');
                    if (!fs.existsSync(indexesDir)) fs.mkdirSync(indexesDir, { recursive: true });

                    // Download asset index if missing or check existing
                    if (!fs.existsSync(assetIndexPath)) {
                        downloads.push({
                            url: assetIndexUrl,
                            destination: assetIndexPath,
                            sha1: versionData.assetIndex?.sha1,
                            size: versionData.assetIndex?.size,
                            priority: 15 // High priority for index
                        });

                        console.log(`[Launch] Asset index will be downloaded: ${assetIndexId}`);
                    }
                }


                // Only download client if we have a URL and (it's missing OR we want to verify)
                // For imported versions, if it exists, assume it's good (TLauncher logic)
                if (clientJarUrl && !fs.existsSync(clientJarPath)) {
                    downloads.push({
                        url: clientJarUrl,
                        destination: clientJarPath,
                        sha1: clientJarSha1,
                        size: clientJarSize,
                        priority: 10
                    });
                }

                // Libraries match
                const cpLibraries: string[] = [];
                if (versionData.libraries) {
                    versionData.libraries.forEach((lib: any) => {
                        // Rules Check
                        if (lib.rules) {
                            let allowed = false;
                            if (lib.rules.some((r: any) => r.action === 'allow' && !r.os)) allowed = true;
                            const osName = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux';
                            if (lib.rules.some((r: any) => r.action === 'allow' && r.os?.name === osName)) allowed = true;
                            if (lib.rules.some((r: any) => r.action === 'disallow' && r.os?.name === osName)) allowed = false;
                            if (!allowed) return;
                        }

                        // Path Resolution
                        let libPath = '';
                        let libUrl = '';
                        let libSha1 = '';
                        let libSize = 0;

                        if (lib.downloads && lib.downloads.artifact) {
                            // Standard Modern Format
                            libPath = path.join(librariesDir, lib.downloads.artifact.path);
                            libUrl = lib.downloads.artifact.url;
                            libSha1 = lib.downloads.artifact.sha1;
                            libSize = lib.downloads.artifact.size;
                        } else if (lib.name) {
                            // Legacy / Maven Format (TLauncher/Forge)
                            // Format: group:name:version
                            const parts = lib.name.split(':');
                            const group = parts[0].replace(/\./g, path.sep); // com.example -> com/example
                            const artifactId = parts[1];
                            const version = parts[2];
                            const filename = `${artifactId}-${version}.jar`;

                            libPath = path.join(librariesDir, group, artifactId, version, filename);

                            // Try to guess URL if missing? usually libraries.minecraft.net OR maven central
                            // But usually local versions assume files exist or providing a `url` field in the ID root.
                            if (lib.url) {
                                libUrl = lib.url + `${group.replace(/\\/g, '/')}/${artifactId}/${version}/${filename}`;
                            } else {
                                // Default repo fallback?
                                libUrl = `https://libraries.minecraft.net/${group.replace(/\\/g, '/')}/${artifactId}/${version}/${filename}`;
                            }
                        }

                        if (libPath) {
                            cpLibraries.push(libPath);

                            // Download if missing or check validity
                            // For local/imported versions, we act robust: if it exists, use it.
                            const exists = fs.existsSync(libPath);
                            if (!exists) {
                                if (libUrl) {
                                    downloads.push({
                                        url: libUrl,
                                        destination: libPath,
                                        sha1: libSha1,
                                        size: libSize
                                    });
                                } else {
                                    console.warn(`[Launch] Missing library ${lib.name} and no URL found.`);
                                }
                            } else if (authData.type !== 'offline') {
                                // Online: We can optionally verify SHA1 if strict.
                                // But for now we trust existing files to speed up launch, 
                                // unless user forces "repair".
                            }
                        }
                    });
                }

                // 3. Start Downloads
                if (downloads.length > 0) {
                    // Check only connectivity if we have downloads?
                    // Actually, let the downloader try. If it fails, we catch it.
                    // But maybe we want to fail faster if we know we are offline?
                    // For now, let's rely on downloader error, but catch it specifically.

                    DiscordManager.getInstance().setDownloadingPresence(instanceId);

                    event.sender.send('launch:progress', { status: 'Downloading files...', progress: 0, total: downloads.length });
                    this.downloader.addToQueue(downloads);

                    try {
                        await new Promise<void>((resolve, reject) => {
                            this.downloader.on('done', resolve);
                            this.downloader.on('error', reject);
                            let lastProgress = 0;
                            this.downloader.on('progress', (p) => {
                                const now = Date.now();
                                if (now - lastProgress > 200) {
                                    event.sender.send('launch:progress', {
                                        status: `Downloading... ${(p.current / 1024 / 1024).toFixed(1)}MB`,
                                        progress: p.current,
                                        total: p.total
                                    });
                                    lastProgress = now;
                                }
                            });
                        });
                    } catch (e: any) {
                        // If we failed to download, check if we are offline.
                        // If we are offline, and the files are ESSENTIAL (libraries), we must fail.
                        // But wait, the queue only contains missing files. So we are missing files.
                        console.error("[Launch] Download failed:", e);
                        throw new Error(`Failed to download required files: ${e.message}. Please check your connection.`);
                    }
                }

                // 3.5 Download Missing/Corrupt Assets
                if (assetIndexUrl && fs.existsSync(assetIndexPath)) {
                    event.sender.send('launch:progress', { status: 'Checking assets...', progress: 0, total: 100 });

                    try {
                        const assetIndex = JSON.parse(fs.readFileSync(assetIndexPath, 'utf-8'));
                        const assetDownloads: DownloadTask[] = [];
                        const objectsDir = path.join(assetsDir, 'objects');

                        if (!fs.existsSync(objectsDir)) {
                            fs.mkdirSync(objectsDir, { recursive: true });
                        }

                        // Check each asset
                        const assets = assetIndex.objects || {};
                        const assetKeys = Object.keys(assets);
                        let checkedCount = 0;

                        for (const assetKey of assetKeys) {
                            const asset = assets[assetKey];
                            const hash = asset.hash;
                            const size = asset.size;

                            // Asset path follows Minecraft structure: objects/[first 2 chars of hash]/[hash]
                            const hashPrefix = hash.substring(0, 2);
                            const assetDir = path.join(objectsDir, hashPrefix);
                            const assetPath = path.join(assetDir, hash);

                            // Check if asset exists and verify size
                            let needsDownload = false;
                            if (!fs.existsSync(assetPath)) {
                                needsDownload = true;
                            } else {
                                // Verify file size matches
                                const stats = fs.statSync(assetPath);
                                if (stats.size !== size) {
                                    // console.log(`[Launch] Asset ${assetKey} size mismatch. Expected: ${size}, Got: ${stats.size}`);
                                    needsDownload = true;
                                }
                            }

                            if (needsDownload) {
                                // Ensure subdirectory exists
                                if (!fs.existsSync(assetDir)) {
                                    fs.mkdirSync(assetDir, { recursive: true });
                                }

                                assetDownloads.push({
                                    url: `https://resources.download.minecraft.net/${hashPrefix}/${hash}`,
                                    destination: assetPath,
                                    sha1: hash,
                                    size: size,
                                    priority: 5 // Lower priority than libraries
                                });
                            }

                            checkedCount++;
                            if (checkedCount % 100 === 0) {
                                event.sender.send('launch:progress', {
                                    status: `Checking assets... ${checkedCount}/${assetKeys.length}`,
                                    progress: checkedCount,
                                    total: assetKeys.length
                                });
                            }
                        }

                        // Download missing/corrupt assets
                        if (assetDownloads.length > 0) {
                            console.log(`[Launch] Downloading ${assetDownloads.length} missing/corrupt assets...`);
                            event.sender.send('launch:progress', {
                                status: `Downloading ${assetDownloads.length} assets...`,
                                progress: 0,
                                total: assetDownloads.length
                            });

                            this.downloader.addToQueue(assetDownloads);

                            // For assets, if we are offline, we might want to skip downloading and try launching anyway?
                            // Minecraft might look broken (missing textures) but it might run.
                            // But AssetDownloader throws on error. 
                            // Let's wrapping this too.
                            try {
                                await new Promise<void>((resolve, reject) => {
                                    this.downloader.on('done', resolve);
                                    this.downloader.on('error', reject);
                                    let lastProgress = 0;
                                    this.downloader.on('progress', (p) => {
                                        const now = Date.now();
                                        if (now - lastProgress > 200) {
                                            event.sender.send('launch:progress', {
                                                status: `Downloading assets... ${(p.current / 1024 / 1024).toFixed(1)}MB`,
                                                progress: p.current,
                                                total: p.total
                                            });
                                            lastProgress = now;
                                        }
                                    });
                                });
                            } catch (e: any) {
                                console.warn("[Launch] Failed to download assets, likely offline. Launching anyway...", e);
                                // We proceed!
                            }
                        }
                    } catch (e) {
                        console.error('[Launch] Failed to process asset index:', e);
                        // Continue launch even if asset check fails
                    }
                }

                // 4. Build Classpath
                const classpath = [...cpLibraries, clientJarPath].join(path.delimiter);

                // 5. Get Java
                event.sender.send('launch:progress', { status: 'Verifying Java...', progress: 99, total: 100 });

                // Determine required Java version from version data
                let requiredJavaVersion = versionData.javaVersion?.majorVersion?.toString();

                if (!requiredJavaVersion) {
                    // Fallback to heuristic based on version number if metadata is missing (common with modloaders)
                    const v = versionId.match(/1\.(\d+)/);
                    if (v && v[1]) {
                        const minor = parseInt(v[1]);
                        if (minor >= 21) requiredJavaVersion = '21'; // 1.21+ needs Java 21
                        else if (minor >= 20 && versionId.includes('1.20.5')) requiredJavaVersion = '21'; // 1.20.5+ needs Java 21
                        else if (minor >= 18) requiredJavaVersion = '17'; // 1.18+ needs Java 17
                        else if (minor === 17) requiredJavaVersion = '16'; // 1.17 needs Java 16
                        else requiredJavaVersion = '8'; // Older needs Java 8
                    } else {
                        requiredJavaVersion = '8';
                    }
                    console.log(`[Launch] Heuristic determined Java version ${requiredJavaVersion} for ${versionId}`);
                }

                // Check for custom Java path (instance-specific first, then global config)
                let javaPath: string;
                
                if (instanceConfig?.javaPath && fs.existsSync(instanceConfig.javaPath)) {
                    // Use instance-specific Java path
                    console.log(`[Launch] Using instance-specific Java: ${instanceConfig.javaPath}`);
                    javaPath = instanceConfig.javaPath;
                } else {
                    const configJavaPath = ConfigManager.getJavaPath(requiredJavaVersion);
                    
                    if (configJavaPath && configJavaPath !== 'auto') {
                        javaPath = configJavaPath;
                    } else {
                        javaPath = await this.javaManager.ensureJava(requiredJavaVersion, (status, progress) => {
                            event.sender.send('launch:progress', {
                                status: status,
                                progress: progress,
                                total: 100
                            });
                            // Forward specific java progress to the modal too, if it's open
                            event.sender.send('java-install-progress', { status, progress });
                        }, async (ver, size) => {
                            console.log(`[Launch] Asking user consent for Java ${ver} (${size} bytes)`);
                            event.sender.send('java-install-request', { version: ver, sizeInBytes: size });

                            return new Promise<'install' | 'skip' | 'cancel'>((resolve) => {
                                // Listen for one-time consent response
                                ipcMain.once('java-install-consent', (_, action: 'install' | 'skip' | 'cancel') => {
                                    resolve(action);
                                    // Also notify frontend that we are done/start (handled by progress events mostly)
                                    if (action !== 'install') event.sender.send('java-install-done');
                                });
                            });
                        });

                        event.sender.send('java-install-done');
                    }
                }

                // Get RAM settings and JVM Preset
                const jvmPreset = ConfigManager.getJvmPreset();
                const customJvmArgs = ConfigManager.getJvmArgs();
                let minRam = ConfigManager.getMinRam();
                let maxRam = ConfigManager.getMaxRam();

                // Preset mappings
                const presetFlags: Record<string, string[]> = {
                    potato: [
                        '-XX:+UseG1GC',
                        '-XX:G1HeapRegionSize=4M',
                        '-XX:+UnlockExperimentalVMOptions',
                        '-XX:+ParallelRefProcEnabled',
                        '-XX:+AlwaysPreTouch',
                    ],
                    standard: [
                        '-XX:+UseG1GC',
                        '-XX:+UnlockExperimentalVMOptions',
                        '-XX:+ParallelRefProcEnabled',
                        '-XX:MaxGCPauseMillis=200',
                        '-XX:+AlwaysPreTouch',
                        '-XX:G1NewSizePercent=30',
                        '-XX:G1MaxNewSizePercent=40',
                        '-XX:G1HeapRegionSize=8M',
                        '-XX:G1ReservePercent=20',
                        '-XX:G1HeapWastePercent=5',
                        '-XX:G1MixedGCCountTarget=4',
                        '-XX:InitiatingHeapOccupancyPercent=15',
                        '-XX:G1MixedGCLiveThresholdPercent=90',
                        '-XX:G1RSetUpdatingPauseTimePercent=5',
                        '-XX:SurvivorRatio=32',
                        '-XX:+PerfDisableSharedMem',
                        '-XX:MaxTenuringThreshold=1',
                    ],
                    pro: [
                        // Aikar's Flags (Optimizations for Mods/Server-heavy clients)
                        '-XX:+UseG1GC',
                        '-XX:+UnlockExperimentalVMOptions',
                        '-XX:+AlwaysPreTouch',
                        '-XX:+ParallelRefProcEnabled',
                        '-XX:MaxGCPauseMillis=200',
                        '-XX:G1NewSizePercent=30',
                        '-XX:G1MaxNewSizePercent=40',
                        '-XX:G1HeapRegionSize=8M',
                        '-XX:G1ReservePercent=20',
                        '-XX:G1HeapWastePercent=5',
                        '-XX:G1MixedGCCountTarget=4',
                        '-XX:InitiatingHeapOccupancyPercent=15',
                        '-XX:G1MixedGCLiveThresholdPercent=90',
                        '-XX:G1RSetUpdatingPauseTimePercent=5',
                        '-XX:SurvivorRatio=32',
                        '-XX:+PerfDisableSharedMem',
                        '-XX:MaxTenuringThreshold=1',
                        '-Dusing.aikars.flags=https://mcutils.com',
                        '-Daikars.new.flags=true'
                    ],
                    extreme: [
                        // Aggressive optimizations for high-RAM systems
                        '-XX:+UseG1GC',
                        '-XX:+UnlockExperimentalVMOptions',
                        '-XX:+AlwaysPreTouch',
                        '-XX:+ParallelRefProcEnabled',
                        '-XX:MaxGCPauseMillis=50',
                        '-XX:G1HeapRegionSize=32M',
                        '-XX:G1NewSizePercent=40',
                        '-XX:G1MaxNewSizePercent=50',
                        '-XX:G1ReservePercent=15',
                        '-XX:G1HeapWastePercent=5',
                        '-XX:G1MixedGCCountTarget=4',
                        '-XX:InitiatingHeapOccupancyPercent=20',
                        '-XX:G1MixedGCLiveThresholdPercent=90',
                        '-XX:G1RSetUpdatingPauseTimePercent=5',
                        '-XX:SurvivorRatio=32',
                        '-XX:+PerfDisableSharedMem',
                        '-XX:MaxTenuringThreshold=1',
                        '-XX:+UseStringDeduplication',
                    ],
                    custom: []
                };

                const proxy = ConfigManager.getProxy();
                const proxyArgs: string[] = [];
                if (proxy.enabled && proxy.host && proxy.port) {
                    if (proxy.type === 'http') {
                        proxyArgs.push(`-Dhttp.proxyHost=${proxy.host}`);
                        proxyArgs.push(`-Dhttp.proxyPort=${proxy.port}`);
                        proxyArgs.push(`-Dhttps.proxyHost=${proxy.host}`);
                        proxyArgs.push(`-Dhttps.proxyPort=${proxy.port}`);
                    } else if (proxy.type === 'socks') {
                        proxyArgs.push(`-DsocksProxyHost=${proxy.host}`);
                        proxyArgs.push(`-DsocksProxyPort=${proxy.port}`);
                    }
                }

                const jvmArgs = [
                    `-Xms${minRam}M`,
                    `-Xmx${maxRam}M`,
                    ...proxyArgs,
                    ...(presetFlags[jvmPreset] || []),
                    ...customJvmArgs,
                    `-Djava.library.path=${nativesDir}`,
                    '-Dminecraft.launcher.brand=whoap',
                    '-Dminecraft.launcher.version=2.0.0',
                    '-Dminecraft.client.jar=' + clientJarPath,
                    '-cp', classpath,
                    versionData.mainClass,
                    '--username', authData.name,
                    '--version', versionId,
                    '--gameDir', instancePath,
                    '--assetsDir', assetsDir,
                    '--assetIndex', versionData.assetIndex?.id || versionData.assets || 'legacy',
                    '--uuid', authData.uuid,
                    // Access token for server authentication
                    '--accessToken', authData.token || '0',
                    '--userType', 'mojang',
                    '--versionType', versionData.type || 'release'
                ];

                const launchBehavior = ConfigManager.getLaunchBehavior();
                const showConsole = ConfigManager.getShowConsoleOnLaunch();

                // Handle window based on launch behavior
                if (launchBehavior === 'hide') {
                    mainWindow?.hide();
                } else if (launchBehavior === 'minimize') {
                    mainWindow?.minimize();
                }
                // 'keep' = keep launcher open, do nothing

                // Show log window if enabled
                if (showConsole) {
                    LogWindowManager.create(instanceId);
                    LogWindowManager.send(instanceId, `Starting ${instanceId} (${versionId})...`, 'info');
                    LogWindowManager.send(instanceId, `Java: ${javaPath}`, 'info');
                    LogWindowManager.send(instanceId, `RAM: ${minRam}MB - ${maxRam}MB`, 'info');
                }

                // Use javaw.exe on windows to avoid console window creation
                if (process.platform === 'win32' && javaPath.endsWith('java.exe')) {
                    javaPath = javaPath.replace('java.exe', 'javaw.exe');
                }

                // Auto-configure Skin Loader if present
                await this.ensureSkinConfig(instancePath, authData);

                DiscordManager.getInstance().setPlayingPresence(instanceId, versionId, undefined, false, undefined);

                // Track playtime
                const startTime = Date.now();
                let sessionPlayTime = 0;

                const gameProcess = spawn(javaPath, jvmArgs, {
                    cwd: instancePath,
                    detached: false, // Keep attached to main process to avoid new terminal window
                    stdio: 'pipe'
                });

                const logBuffer: string[] = [];
                const MAX_LOG_LINES = 500;

                const appendLog = (data: string) => {
                    const lines = data.split('\n');
                    logBuffer.push(...lines);
                    if (logBuffer.length > MAX_LOG_LINES) {
                        logBuffer.splice(0, logBuffer.length - MAX_LOG_LINES);
                    }
                };

                gameProcess.stdout.on('data', (d) => {
                    const str = d.toString();
                    appendLog(str);
                    if (showConsole) {
                        LogWindowManager.send(instanceId, str, 'stdout');
                    }
                });

                gameProcess.stderr.on('data', (d) => {
                    const str = d.toString();
                    appendLog(str);
                    if (showConsole) {
                        LogWindowManager.send(instanceId, str, 'stderr');
                    }
                });

                gameProcess.on('error', (err) => {
                    console.error("Failed to start game process", err);
                    event.sender.send('launch:error', err.message);
                    if (showConsole) {
                        LogWindowManager.send(instanceId, `Launch Error: ${err.message}`, 'stderr');
                    }
                    mainWindow?.show();
                });

                gameProcess.on('close', async (code) => {
                    // Calculate and save playtime
                    sessionPlayTime = Math.floor((Date.now() - startTime) / 1000);
                    if (sessionPlayTime > 0) {
                        console.log(`[LaunchProcess] Session lasted ${sessionPlayTime}s, saving playtime...`);
                        await InstanceManager.getInstance().addPlayTime(instanceId, sessionPlayTime);
                    }

                    if (code !== 0) {
                        console.log("Game crashed! Analyzing...");
                        import('./CrashAnalyzer').then(({ CrashAnalyzer }) => {
                            const report = CrashAnalyzer.analyze(code || 1, logBuffer);
                            event.sender.send('launch:crash', {
                                report,
                                log: logBuffer.slice(-100).join('\n') // Send last 100 lines for quick view
                            });
                        });
                    }

                    // Show Launcher
                    mainWindow?.show();
                    mainWindow?.focus();

                    // Restore Menu Presence
                    DiscordManager.getInstance().setMenuPresence();
                });

                gameProcess.unref();

                return { success: true };

            } catch (error) {
                console.error("Launch failed", error);
                // Ensure window is back if we crashed synchronously
                mainWindow?.show();
                return { success: false, error: String(error) };
            }
        });
    }

    /**
     * Download a file from URL and save to disk.
     */
    private async downloadFile(url: string, dest: string): Promise<void> {
        const https = await import('https');
        const http = await import('http');

        return new Promise((resolve, reject) => {
            const mod = (url.startsWith('https') ? https : http) as any;
            const request = mod.get(url, (response: any) => {
                // Follow redirects
                if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                    this.downloadFile(response.headers.location, dest).then(resolve).catch(reject);
                    return;
                }
                if (response.statusCode !== 200) {
                    reject(new Error(`Download failed: ${response.statusCode}`));
                    return;
                }
                const fileStream = fs.createWriteStream(dest);
                response.pipe(fileStream);
                fileStream.on('finish', () => { fileStream.close(); resolve(); });
                fileStream.on('error', reject);
            });
            request.on('error', reject);
            request.setTimeout(10000, () => { request.destroy(); reject(new Error('Download timeout')); });
        });
    }

    /**
     * Copies a skin or cape source file to a target path.
     * Handles both custom imported files (file: prefix) and username-based downloads.
     */
    private async deploySkinFile(
        skinSource: string,
        targetFile: string,
        type: 'skin' | 'cape'
    ): Promise<boolean> {
        try {
            // Strip any trailing slashes or query params from source
            const normalizedSource = skinSource.split('?')[0].replace(/[\\/]+$/, '');

            // Determine if it's a custom/local file
            const lower = normalizedSource.toLowerCase();
            const isCustom = lower.startsWith('file:') ||
                lower.startsWith('whoap-skin://') ||
                lower.startsWith('whoap-cape://') ||
                (lower.endsWith('.png') && !lower.startsWith('http'));

            if (isCustom) {
                const fileName = normalizedSource
                    .replace('file:', '')
                    .replace('whoap-skin://', '')
                    .replace('whoap-cape://', '');

                const subDir = type === 'skin' ? 'skins' : 'capes';
                const srcPath = path.join(ConfigManager.getDataPath(), subDir, fileName);

                if (fs.existsSync(srcPath)) {
                    fs.copyFileSync(srcPath, targetFile);
                    console.log(`[Launch] Deployed custom ${type}: "${fileName}" -> "${targetFile}"`);
                    return true;
                } else {
                    console.warn(`[Launch] Custom ${type} source NOT FOUND: "${srcPath}"`);
                    return false;
                }
            } else if (type === 'skin') {
                // Username — download skin texture from mc-heads.net
                const skinUrl = `https://mc-heads.net/skin/${encodeURIComponent(skinSource)}`;
                console.log(`[Launch] Downloading remote skin for "${skinSource}"...`);
                await this.downloadFile(skinUrl, targetFile);
                console.log(`[Launch] Downloaded skin to: "${targetFile}"`);
                return true;
            }
        } catch (e) {
            console.warn(`[Launch] Exception during ${type} deployment for "${skinSource}":`, e);
        }
        return false;
    }

    private async ensureSkinConfig(instancePath: string, authData?: any) {
        try {
            const mcUsername = authData?.name || authData?.username || "Steve";
            const skinSource = authData?.preferredSkin || mcUsername;
            const capeSource = authData?.preferredCape;

            console.log(`[Launch] --- Skin/Cape Debug ---`);
            console.log(`[Launch] MC Username: ${mcUsername}`);
            console.log(`[Launch] Skin Source: ${skinSource}`);
            console.log(`[Launch] Cape Source: ${capeSource || 'NONE'}`);

            // 1. Detect Mods/Existing Folders to avoid clutter
            const modsDir = path.join(instancePath, 'mods');
            let hasCSL = false;

            if (fs.existsSync(modsDir)) {
                try {
                    const files = await fs.promises.readdir(modsDir);
                    const filesLower = files.map(f => f.toLowerCase());
                    hasCSL = filesLower.some(f => f.includes('customskinloader'));
                } catch (e) {
                    console.warn("[Launch] Failed to scan mods folder:", e);
                }
            }

            // Also check for existing folders (even if mod isn't in 'mods' - e.g. embedded or different name)
            const cslDir = path.join(instancePath, 'CustomSkinLoader');

            if (!hasCSL && fs.existsSync(cslDir)) hasCSL = true;

            // 2. Build deployment targets based on detected mods
            const deployTargets: { skinsDir: string, capesDir: string, label: string }[] = [];

            if (hasCSL) {
                deployTargets.push({
                    skinsDir: path.join(cslDir, 'LocalSkins', 'skins'),
                    capesDir: path.join(cslDir, 'LocalSkins', 'capes'),
                    label: 'CustomSkinLoader'
                });
            }

            if (deployTargets.length === 0) {
                console.log("[Launch] No skin mods detected for this instance, skipping local skin deployment.");
                return;
            }

            console.log(`[Launch] Deploying to: ${deployTargets.map(t => t.label).join(', ')}`);

            // Deploy skin
            if (skinSource) {
                for (const target of deployTargets) {
                    if (!fs.existsSync(target.skinsDir)) fs.mkdirSync(target.skinsDir, { recursive: true });
                    const targetFile = path.join(target.skinsDir, `${mcUsername}.png`);
                    await this.deploySkinFile(skinSource, targetFile, 'skin');
                }
            }

            // Deploy cape
            if (capeSource) {
                for (const target of deployTargets) {
                    if (!fs.existsSync(target.capesDir)) fs.mkdirSync(target.capesDir, { recursive: true });
                    const targetFile = path.join(target.capesDir, `${mcUsername}.png`);
                    await this.deploySkinFile(capeSource, targetFile, 'cape');
                }
            }

            // --- Configure CustomSkinLoader JSON ---
            if (hasCSL) {
                const configDir = path.join(instancePath, 'CustomSkinLoader');
                if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

                const configPath = path.join(configDir, 'CustomSkinLoader.json');

                const whoapServer = {
                    "name": "Whoap Skin Server",
                    "type": "CustomSkinAPI",
                    "root": "https://skins.whoap.gg/"
                };

                const localSkinEntry = {
                    "name": "LocalSkin",
                    "type": "Legacy",
                    "root": "./",
                    "checkPNG": false,
                    "skin": "LocalSkins/skins/{USERNAME}.png",
                    "model": "auto",
                    "cape": "LocalSkins/capes/{USERNAME}.png",
                    "elytra": "LocalSkins/elytras/{USERNAME}.png"
                };

                let config: any = {
                    "enable": true,
                    "loadlist": [
                        localSkinEntry,
                        whoapServer,
                        {
                            "name": "Mojang",
                            "type": "MojangAPI"
                        }
                    ]
                };

                if (fs.existsSync(configPath)) {
                    try {
                        const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                        if (existing.loadlist && Array.isArray(existing.loadlist)) {
                            // Remove stale LocalSkin and Whoap entries, then re-add at top
                            const filtered = existing.loadlist.filter(
                                (e: any) => e.name !== "LocalSkin" && e.name !== "Whoap Skin Server"
                            );
                            existing.loadlist = [localSkinEntry, whoapServer, ...filtered];
                            config = existing;
                        }
                    } catch (e) {
                        // Corrupt config, overwrite with fresh one
                        console.warn("[Launch] Corrupt CSL config, overwriting...");
                    }
                }

                await fs.promises.writeFile(configPath, JSON.stringify(config, null, 4));
                console.log("[Launch] Configured CustomSkinLoader with LocalSkin + Whoap Server.");
            }
        } catch (e) {
            console.warn("[Launch] Failed to configure skin loader", e);
        }
    }
}



