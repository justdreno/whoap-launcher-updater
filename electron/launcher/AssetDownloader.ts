import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { EventEmitter } from 'events';
import axios, { AxiosRequestConfig } from 'axios';
import { createWriteStream, createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

export interface DownloadTask {
    url: string;
    destination: string;
    sha1?: string;
    size?: number;
    priority?: number;
}

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 1000;

export class AssetDownloader extends EventEmitter {
    private queue: DownloadTask[] = [];
    private activeDownloads = 0;
    private maxConcurrent = 5; // Lower concurrency for stability on bad networks
    private totalBytes = 0;
    private downloadedBytes = 0;

    constructor() {
        super();
    }

    addToQueue(tasks: DownloadTask[]) {
        this.queue.push(...tasks);
        // Add estimated size to total (if known)
        tasks.forEach(t => {
            console.log(`[AssetDownloader] Adding task ${path.basename(t.destination)} size=${t.size}`);
            this.totalBytes += (t.size || 0);
        });
        console.log(`[AssetDownloader] New totalBytes: ${this.totalBytes}`);
        this.processQueue();
    }

    private processQueue() {
        if (this.queue.length === 0 && this.activeDownloads === 0) {
            this.emit('done');
            return;
        }

        while (this.activeDownloads < this.maxConcurrent && this.queue.length > 0) {
            const task = this.queue.shift();
            if (task) {
                this.downloadFile(task).catch(err => {
                    // Global error handler if needed, though tasks handle their own errors/retries
                    console.error("Task failed fatally:", err);
                });
            }
        }
    }

    private async downloadFile(task: DownloadTask) {
        this.activeDownloads++;

        const dir = path.dirname(task.destination);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // 1. Check if complete file exists and is valid
        if (fs.existsSync(task.destination)) {
            if (task.sha1) {
                const valid = await this.verifyFile(task.destination, task.sha1);
                if (valid) {
                    console.log(`[Downloader] Cache hit for ${path.basename(task.destination)}`);
                    this.downloadedBytes += (task.size || 0); // Count as done
                    this.emit('progress', { total: this.totalBytes, current: this.downloadedBytes });
                    this.activeDownloads--;
                    this.processQueue();
                    return;
                } else {
                    console.warn(`[Downloader] Hash mismatch for existing file ${task.destination}, redownloading.`);
                    fs.unlinkSync(task.destination); // Delete invalid file
                }
            } else {
                // No hash provided, assume existing file is good? 
                // Risk: corrupted file stays. Better to re-download if unsure or check size?
                // For now, if no hash, we assume it's good to avoid redownloading everything.
                // Ideally we should always provide hash.
                this.activeDownloads--;
                this.processQueue();
                return;
            }
        }

        // 2. Start Download Loop with Retries
        let attempt = 0;
        let downloaded = false;

        while (attempt < MAX_RETRIES && !downloaded) {
            try {
                await this.performDownload(task);
                downloaded = true;
            } catch (error: any) {
                attempt++;
                console.error(`[Downloader] Failed ${task.url} (Attempt ${attempt}/${MAX_RETRIES}): ${error.message}`);

                if (attempt >= MAX_RETRIES) {
                    this.emit('error', new Error(`Failed to download ${path.basename(task.destination)} after ${MAX_RETRIES} attempts: ${error.message}`));
                    this.activeDownloads--; // Ensure we decrement even on fatal error
                    this.processQueue();
                    return;
                }

                // Exponential Backoff
                const delay = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
                await new Promise(r => setTimeout(r, delay));
            }
        }

        // 3. Post-Download Validation
        if (downloaded) {
            if (task.sha1) {
                const valid = await this.verifyFile(task.destination, task.sha1);
                if (!valid) {
                    // This is bad. We just downloaded it and it's wrong.
                    // Could be a bad CDN, man-in-the-middle, or disk error.
                    // We should probably fail hard here or retry the whole task?
                    // For now, fail.
                    console.error(`[Downloader] Hash verification failed after download for ${task.destination}`);
                    fs.unlinkSync(task.destination);
                    this.emit('error', new Error(`Hash mismatch after download for ${path.basename(task.destination)}`));
                } else {
                    this.emit('progress', { total: this.totalBytes, current: this.downloadedBytes });
                }
            }
        }

        this.activeDownloads--;
        this.processQueue();
    }

    private async performDownload(task: DownloadTask): Promise<void> {
        const partFile = `${task.destination}.part`;
        let startByte = 0;

        // Resume support
        if (fs.existsSync(partFile)) {
            startByte = fs.statSync(partFile).size;
            // If local part is larger than expected size, it's corrupt. Reset.
            if (task.size && startByte > task.size) {
                startByte = 0;
                fs.unlinkSync(partFile);
            }
        }

        const config: AxiosRequestConfig = {
            responseType: 'stream',
            timeout: 30000, // 30s timeout
            headers: {}
        };

        if (startByte > 0) {
            console.log(`[Downloader] Resuming ${path.basename(task.destination)} from byte ${startByte}`);
            config.headers = { 'Range': `bytes=${startByte}-` };
        }

        const response = await axios.get(task.url, config);

        // Handle range mismatch (server might not support range, sends 200 instead of 206)
        // If we requested partial but got full (200), we must overwrite partFile
        if (startByte > 0 && response.status === 200) {
            console.warn(`[Downloader] Server does not support resume for ${task.url}, restarting.`);
            startByte = 0; // Reset
            // Truncate part file
            fs.writeFileSync(partFile, '');
        }

        let localDownloaded = 0;
        let lastEmitTime = 0;

        const writer = createWriteStream(partFile, { flags: startByte > 0 ? 'a' : 'w' });

        response.data.on('data', (chunk: Buffer) => {
            localDownloaded += chunk.length;
            this.downloadedBytes += chunk.length;

            const now = Date.now();
            if (now - lastEmitTime > 100) {
                console.log(`[Downloader] Progress: ${this.downloadedBytes}/${this.totalBytes}`);
                this.emit('progress', { total: this.totalBytes, current: this.downloadedBytes });
                lastEmitTime = now;
            }
        });

        await pipeline(response.data, writer);

        // Rename part to final
        fs.renameSync(partFile, task.destination);
    }

    private verifyFile(filePath: string, sha1: string): Promise<boolean> {
        return new Promise((resolve) => {
            const hash = crypto.createHash('sha1');
            const stream = createReadStream(filePath);

            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => {
                const fileHash = hash.digest('hex');
                if (fileHash !== sha1) {
                    console.warn(`[Verify] Fail: Expected ${sha1}, got ${fileHash}`);
                }
                resolve(fileHash === sha1);
            });
            stream.on('error', () => resolve(false));
        });
    }
}
