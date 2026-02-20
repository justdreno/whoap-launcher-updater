import { BrowserWindow, ipcMain, net } from 'electron';

interface BackgroundSyncOptions {
  enabled: boolean;
  intervalMinutes: number;
  syncOnStartup: boolean;
  syncOnShutdown: boolean;
}

export class BackgroundSync {
  private static instance: BackgroundSync;
  private syncInterval: NodeJS.Timeout | null = null;
  private options: BackgroundSyncOptions;
  private isRunning = false;
  private lastSyncTime: number = 0;
  private syncInProgress = false;

  constructor(options: Partial<BackgroundSyncOptions> = {}) {
    this.options = {
      enabled: true,
      intervalMinutes: 15,
      syncOnStartup: true,
      syncOnShutdown: true,
      ...options
    };
  }

  static getInstance(options?: Partial<BackgroundSyncOptions>): BackgroundSync {
    if (!BackgroundSync.instance) {
      BackgroundSync.instance = new BackgroundSync(options);
    }
    return BackgroundSync.instance;
  }

  /**
   * Start background sync service
   */
  start(): void {
    if (!this.options.enabled || this.isRunning) return;

    console.log('[BackgroundSync] Starting service...');
    this.isRunning = true;

    // Initial sync on startup (if enabled and online)
    if (this.options.syncOnStartup) {
      this.performStartupSync();
    }

    // Set up periodic sync
    if (this.options.intervalMinutes > 0) {
      this.syncInterval = setInterval(
        () => this.performPeriodicSync(),
        this.options.intervalMinutes * 60 * 1000
      );
      console.log(`[BackgroundSync] Periodic sync scheduled every ${this.options.intervalMinutes} minutes`);
    }
  }

  /**
   * Stop background sync service
   */
  stop(): void {
    console.log('[BackgroundSync] Stopping service...');
    this.isRunning = false;

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    // Final sync on shutdown (if enabled)
    if (this.options.syncOnShutdown) {
      this.performShutdownSync();
    }
  }

  /**
   * Perform sync on app startup
   */
  private async performStartupSync(): Promise<void> {
    console.log('[BackgroundSync] Performing startup sync...');
    
    // Delay slightly to allow app to fully initialize
    setTimeout(async () => {
      await this.performSync('startup');
    }, 5000);
  }

  /**
   * Perform periodic sync
   */
  private async performPeriodicSync(): Promise<void> {
    const timeSinceLastSync = Date.now() - this.lastSyncTime;
    const minInterval = 5 * 60 * 1000; // Minimum 5 minutes between syncs

    if (timeSinceLastSync < minInterval) {
      console.log('[BackgroundSync] Skipping periodic sync - too soon since last sync');
      return;
    }

    console.log('[BackgroundSync] Performing periodic sync...');
    await this.performSync('periodic');
  }

  /**
   * Perform sync on app shutdown
   */
  private performShutdownSync(): void {
    console.log('[BackgroundSync] Performing shutdown sync...');
    
    // Send IPC to renderer to trigger final sync
    if (!this.syncInProgress) {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        windows[0].webContents.send('sync:shutdown-request');
      }
    }
  }

  /**
   * Perform actual sync operation - requests renderer to process queue
   */
  private async performSync(trigger: 'startup' | 'periodic' | 'manual'): Promise<void> {
    if (this.syncInProgress) {
      console.log('[BackgroundSync] Sync already in progress, skipping...');
      return;
    }

    // Check if we're online
    const isOnline = await this.checkOnlineStatus();
    if (!isOnline) {
      console.log('[BackgroundSync] Offline, skipping sync');
      return;
    }

    this.syncInProgress = true;
    console.log(`[BackgroundSync] Starting ${trigger} sync...`);

    try {
      // Notify renderer that sync is starting
      this.notifyRenderer('sync:started', { trigger, timestamp: Date.now() });

      // Request renderer to process the sync queue
      const success = await this.requestRendererSync();

      if (success) {
        // Update last sync time
        this.lastSyncTime = Date.now();

        // Notify renderer of success
        this.notifyRenderer('sync:completed', { 
          trigger, 
          timestamp: this.lastSyncTime
        });

        console.log('[BackgroundSync] Sync completed successfully');
      } else {
        console.log('[BackgroundSync] Sync queue was empty or not processed');
      }
    } catch (error) {
      console.error('[BackgroundSync] Sync failed:', error);
      this.notifyRenderer('sync:error', { trigger, error: String(error) });
    } finally {
      this.syncInProgress = false;
    }
  }

  /**
   * Request renderer to process sync queue
   */
  private async requestRendererSync(): Promise<boolean> {
    return new Promise((resolve) => {
      const windows = BrowserWindow.getAllWindows();
      if (windows.length === 0) {
        resolve(false);
        return;
      }

      const window = windows[0];
      
      // Set up one-time listener for response
      const handleResponse = (_event: any, result: { success: boolean; processed: number }) => {
        ipcMain.off('sync:process-response', handleResponse);
        resolve(result.success);
      };

      ipcMain.once('sync:process-response', handleResponse);

      // Send request to renderer
      window.webContents.send('sync:process-request');

      // Timeout after 30 seconds
      setTimeout(() => {
        ipcMain.off('sync:process-response', handleResponse);
        resolve(false);
      }, 30000);
    });
  }

  /**
   * Check if we're online
   */
  private async checkOnlineStatus(): Promise<boolean> {
    try {
      const response = await net.fetch('https://api.github.com', { 
        method: 'HEAD'
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Notify renderer process of sync events
   */
  private notifyRenderer(channel: string, data: any): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, data);
      }
    });
  }

  /**
   * Manually trigger a sync
   */
  async syncNow(): Promise<void> {
    console.log('[BackgroundSync] Manual sync triggered');
    await this.performSync('manual');
  }

  /**
   * Get sync status
   */
  getStatus(): {
    isRunning: boolean;
    lastSyncTime: number;
    syncInProgress: boolean;
    options: BackgroundSyncOptions;
  } {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      syncInProgress: this.syncInProgress,
      options: { ...this.options }
    };
  }

  /**
   * Update sync options
   */
  updateOptions(options: Partial<BackgroundSyncOptions>): void {
    this.options = { ...this.options, ...options };
    
    // Restart if running and interval changed
    if (this.isRunning && options.intervalMinutes !== undefined) {
      this.stop();
      this.start();
    }
  }
}

// Export singleton instance
export const backgroundSync = BackgroundSync.getInstance();
