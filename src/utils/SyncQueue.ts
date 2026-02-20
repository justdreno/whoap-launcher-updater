import { OfflineManager } from './OfflineManager';

export type SyncActionType = 
  | 'instance:create' 
  | 'instance:update' 
  | 'instance:delete'
  | 'settings:update'
  | 'skin:update'
  | 'cape:update'
  | 'friend:request'
  | 'friend:accept'
  | 'friend:remove';

export type SyncErrorType = 
  | 'network' 
  | 'timeout' 
  | 'server' 
  | 'auth' 
  | 'conflict' 
  | 'unknown';

export interface SyncAction {
  id: string;
  type: SyncActionType;
  payload: any;
  timestamp: number;
  retryCount: number;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  error?: string;
  errorType?: SyncErrorType;
  lastAttempt?: number;
  nextRetryAt?: number;
}

export interface SyncQueueState {
  actions: SyncAction[];
  lastSyncTime: number | null;
  isProcessing: boolean;
  isCorrupted?: boolean;
  storageError?: string;
}

export interface SyncStats {
  total: number;
  pending: number;
  processing: number;
  failed: number;
  completed: number;
  avgRetryCount: number;
  oldestAction: number | null;
}

const QUEUE_STORAGE_KEY = 'whoap_sync_queue';
const QUEUE_BACKUP_KEY = 'whoap_sync_queue_backup';
const MAX_RETRY_COUNT = 5;
const PROCESSING_DELAY = 1000;
const BATCH_SIZE = 50; // Process max 50 items at a time
const RETRY_DELAYS = [1000, 5000, 15000, 60000, 300000]; // 1s, 5s, 15s, 1m, 5m
const ACTION_TIMEOUT = 30000; // 30 seconds per action
const QUEUE_MAX_SIZE = 500; // Prevent unlimited queue growth

class SyncQueueManager {
  private queue: SyncAction[] = [];
  private lastSyncTime: number | null = null;
  private isProcessing = false;
  private isCorrupted = false;
  private storageError: string | null = null;
  private listeners: Set<(queue: SyncQueueState) => void> = new Set();
  private unsubscribeOffline: (() => void) | null = null;
  private backgroundSyncListeners: Set<(event: string, data: any) => void> = new Set();
  private processingStartTime: number = 0;

  constructor() {
    this.loadFromStorage();
    this.setupOfflineListener();
    this.setupBackgroundSyncListener();
    this.startHealthCheck();
  }

  private setupOfflineListener(): void {
    this.unsubscribeOffline = OfflineManager.subscribe((isOffline) => {
      if (!isOffline && this.queue.length > 0) {
        console.log('[SyncQueue] Back online, processing queue...');
        // Delay slightly to ensure network is stable
        setTimeout(() => this.processQueue(), 2000);
      }
    });
  }

  private setupBackgroundSyncListener(): void {
    if (typeof window !== 'undefined' && window.ipcRenderer) {
      window.ipcRenderer.on('sync:process-request', async () => {
        console.log('[SyncQueue] Background sync requested from main process');
        const pendingCount = this.getPendingCount();
        
        if (pendingCount > 0 && !OfflineManager.isOffline()) {
          await this.processQueue();
          window.ipcRenderer.send('sync:process-response', { 
            success: true, 
            processed: pendingCount 
          });
        } else {
          window.ipcRenderer.send('sync:process-response', { 
            success: true, 
            processed: 0 
          });
        }
      });

      window.ipcRenderer.on('sync:started', (_event: any, data: any) => {
        console.log('[SyncQueue] Background sync started:', data);
        this.backgroundSyncListeners.forEach(listener => listener('started', data));
      });

      window.ipcRenderer.on('sync:completed', (_event: any, data: any) => {
        console.log('[SyncQueue] Background sync completed:', data);
        this.backgroundSyncListeners.forEach(listener => listener('completed', data));
      });

      window.ipcRenderer.on('sync:error', (_event: any, data: any) => {
        console.error('[SyncQueue] Background sync error:', data);
        this.backgroundSyncListeners.forEach(listener => listener('error', data));
      });
    }
  }

  private startHealthCheck(): void {
    // Health check every 30 seconds
    setInterval(() => {
      this.performHealthCheck();
    }, 30000);
  }

  private performHealthCheck(): void {
    // Check for stuck actions (processing for too long)
    const now = Date.now();
    const stuckActions = this.queue.filter(a => {
      if (a.status !== 'processing') return false;
      if (!a.lastAttempt) return false;
      return (now - a.lastAttempt) > ACTION_TIMEOUT * 2;
    });

    if (stuckActions.length > 0) {
      console.warn(`[SyncQueue] Found ${stuckActions.length} stuck actions, resetting...`);
      stuckActions.forEach(action => {
        action.status = 'pending';
        action.error = 'Action timed out';
        action.errorType = 'timeout';
      });
      this.saveToStorage();
      this.notifyListeners();
    }

    // Check queue size
    if (this.queue.length > QUEUE_MAX_SIZE) {
      console.warn(`[SyncQueue] Queue size (${this.queue.length}) exceeds limit (${QUEUE_MAX_SIZE}), trimming...`);
      // Keep only pending and failed actions, remove oldest completed
      const completedActions = this.queue.filter(a => a.status === 'completed');
      const actionsToKeep = this.queue.filter(a => a.status !== 'completed');
      
      if (completedActions.length > 0) {
        // Remove oldest completed actions
        const sortedCompleted = completedActions.sort((a, b) => b.timestamp - a.timestamp);
        const toRemove = sortedCompleted.slice(QUEUE_MAX_SIZE - actionsToKeep.length);
        this.queue = actionsToKeep;
        console.log(`[SyncQueue] Removed ${toRemove.length} old completed actions`);
        this.saveToStorage();
        this.notifyListeners();
      }
    }
  }

  private generateId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        
        // Validate data structure
        if (!this.isValidQueueData(data)) {
          throw new Error('Invalid queue data structure');
        }
        
        this.queue = data.actions || [];
        this.lastSyncTime = data.lastSyncTime || null;
        
        // Reset processing status for any actions that were interrupted
        this.queue.forEach(action => {
          if (action.status === 'processing') {
            action.status = 'pending';
            action.error = 'Interrupted by app restart';
            action.errorType = 'unknown';
          }
        });
        
        this.isCorrupted = false;
        this.storageError = null;
        
        console.log(`[SyncQueue] Loaded ${this.queue.length} actions from storage`);
        
        // Create backup
        this.createBackup();
      }
    } catch (e) {
      console.error('[SyncQueue] Failed to load from storage:', e);
      this.isCorrupted = true;
      this.storageError = String(e);
      
      // Try to restore from backup
      this.restoreFromBackup();
    }
  }

  private isValidQueueData(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    if (!Array.isArray(data.actions)) return false;
    
    // Validate each action
    return data.actions.every((action: any) => {
      return (
        action &&
        typeof action.id === 'string' &&
        typeof action.type === 'string' &&
        typeof action.timestamp === 'number' &&
        typeof action.retryCount === 'number' &&
        ['pending', 'processing', 'failed', 'completed'].includes(action.status)
      );
    });
  }

  private createBackup(): void {
    try {
      const data = {
        actions: this.queue,
        lastSyncTime: this.lastSyncTime,
        backupCreated: Date.now()
      };
      localStorage.setItem(QUEUE_BACKUP_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[SyncQueue] Failed to create backup:', e);
    }
  }

  private restoreFromBackup(): void {
    try {
      const backup = localStorage.getItem(QUEUE_BACKUP_KEY);
      if (backup) {
        const data = JSON.parse(backup);
        if (this.isValidQueueData(data)) {
          this.queue = data.actions || [];
          this.lastSyncTime = data.lastSyncTime || null;
          this.isCorrupted = false;
          console.log(`[SyncQueue] Restored ${this.queue.length} actions from backup`);
        } else {
          console.error('[SyncQueue] Backup is also corrupted, starting fresh');
          this.queue = [];
        }
      } else {
        console.log('[SyncQueue] No backup found, starting fresh');
        this.queue = [];
      }
    } catch (e) {
      console.error('[SyncQueue] Failed to restore from backup:', e);
      this.queue = [];
    }
  }

  private saveToStorage(): boolean {
    try {
      const data: SyncQueueState = {
        actions: this.queue,
        lastSyncTime: this.lastSyncTime,
        isProcessing: this.isProcessing
      };
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(data));
      
      // Also update backup periodically (every 10 saves)
      if (Math.random() < 0.1) {
        this.createBackup();
      }
      
      this.isCorrupted = false;
      this.storageError = null;
      return true;
    } catch (e) {
      console.error('[SyncQueue] Failed to save to storage:', e);
      this.storageError = String(e);
      
      // Check if it's a quota exceeded error
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        this.handleStorageQuotaExceeded();
      }
      
      return false;
    }
  }

  private handleStorageQuotaExceeded(): void {
    console.warn('[SyncQueue] Storage quota exceeded, cleaning up...');
    
    // Remove completed actions
    const completedCount = this.queue.filter(a => a.status === 'completed').length;
    this.queue = this.queue.filter(a => a.status !== 'completed');
    
    if (completedCount > 0) {
      console.log(`[SyncQueue] Removed ${completedCount} completed actions to free space`);
    }
    
    // If still too big, remove oldest failed actions
    if (this.queue.length > 100) {
      const failedActions = this.queue.filter(a => a.status === 'failed');
      const sortedFailed = failedActions.sort((a, b) => a.timestamp - b.timestamp);
      const toRemove = sortedFailed.slice(0, Math.floor(sortedFailed.length / 2));
      this.queue = this.queue.filter(a => !toRemove.includes(a));
      console.log(`[SyncQueue] Removed ${toRemove.length} old failed actions`);
    }
    
    // Try saving again
    try {
      const data: SyncQueueState = {
        actions: this.queue,
        lastSyncTime: this.lastSyncTime,
        isProcessing: this.isProcessing
      };
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(data));
      console.log('[SyncQueue] Successfully saved after cleanup');
    } catch (e) {
      console.error('[SyncQueue] Still cannot save after cleanup:', e);
    }
  }

  private notifyListeners(): void {
    const state: SyncQueueState = {
      actions: [...this.queue],
      lastSyncTime: this.lastSyncTime,
      isProcessing: this.isProcessing,
      isCorrupted: this.isCorrupted,
      storageError: this.storageError || undefined
    };
    this.listeners.forEach(listener => listener(state));
  }

  /**
   * Add an action to the sync queue
   */
  enqueue(type: SyncActionType, payload: any): string {
    // Check queue size limit
    if (this.queue.length >= QUEUE_MAX_SIZE) {
      console.warn(`[SyncQueue] Queue full (${QUEUE_MAX_SIZE}), removing oldest completed actions`);
      this.cleanupCompletedActions();
      
      if (this.queue.length >= QUEUE_MAX_SIZE) {
        console.error('[SyncQueue] Cannot enqueue: queue is full');
        throw new Error('Sync queue is full. Please wait for current sync to complete.');
      }
    }

    const action: SyncAction = {
      id: this.generateId(),
      type,
      payload,
      timestamp: Date.now(),
      retryCount: 0,
      status: 'pending'
    };

    this.queue.push(action);
    this.saveToStorage();
    this.notifyListeners();

    console.log(`[SyncQueue] Enqueued: ${type}`, payload);

    // If we're online, try to process immediately (with debounce)
    if (!OfflineManager.isOffline()) {
      this.debouncedProcessQueue();
    }

    return action.id;
  }

  private debouncedProcessQueue(): void {
    // Clear any existing timeout
    if ((this as any).processTimeout) {
      clearTimeout((this as any).processTimeout);
    }
    
    // Set new timeout
    (this as any).processTimeout = setTimeout(() => {
      this.processQueue();
    }, 500);
  }

  private cleanupCompletedActions(): void {
    const beforeCount = this.queue.length;
    this.queue = this.queue.filter(a => a.status !== 'completed');
    const removedCount = beforeCount - this.queue.length;
    if (removedCount > 0) {
      console.log(`[SyncQueue] Cleaned up ${removedCount} completed actions`);
      this.saveToStorage();
    }
  }

  /**
   * Remove an action from the queue
   */
  dequeue(actionId: string): boolean {
    const index = this.queue.findIndex(a => a.id === actionId);
    if (index !== -1) {
      this.queue.splice(index, 1);
      this.saveToStorage();
      this.notifyListeners();
      return true;
    }
    return false;
  }

  /**
   * Get the current queue state
   */
  getQueue(): SyncQueueState {
    return {
      actions: [...this.queue],
      lastSyncTime: this.lastSyncTime,
      isProcessing: this.isProcessing,
      isCorrupted: this.isCorrupted,
      storageError: this.storageError || undefined
    };
  }

  /**
   * Get sync statistics
   */
  getStats(): SyncStats {
    const pending = this.queue.filter(a => a.status === 'pending').length;
    const processing = this.queue.filter(a => a.status === 'processing').length;
    const failed = this.queue.filter(a => a.status === 'failed').length;
    const completed = this.queue.filter(a => a.status === 'completed').length;
    
    const totalRetries = this.queue.reduce((sum, a) => sum + a.retryCount, 0);
    const avgRetryCount = this.queue.length > 0 ? totalRetries / this.queue.length : 0;
    
    const oldestAction = this.queue.length > 0 
      ? Math.min(...this.queue.map(a => a.timestamp))
      : null;

    return {
      total: this.queue.length,
      pending,
      processing,
      failed,
      completed,
      avgRetryCount: Math.round(avgRetryCount * 10) / 10,
      oldestAction
    };
  }

  /**
   * Get pending actions count
   */
  getPendingCount(): number {
    return this.queue.filter(a => a.status === 'pending' || a.status === 'failed').length;
  }

  /**
   * Get the last sync time as a formatted string
   */
  getLastSyncText(): string {
    if (!this.lastSyncTime) return 'Never';
    const diff = Date.now() - this.lastSyncTime;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''} ago`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    return 'Just now';
  }

  /**
   * Process the sync queue with batching
   */
  async processQueue(): Promise<void> {
    if (this.isProcessing) {
      console.log('[SyncQueue] Already processing, skipping...');
      return;
    }
    if (OfflineManager.isOffline()) {
      console.log('[SyncQueue] Offline, cannot process queue');
      return;
    }

    this.isProcessing = true;
    this.processingStartTime = Date.now();
    this.notifyListeners();

    try {
      // Get pending actions, sorted by retry count (fewer retries first) then by timestamp
      let pendingActions = this.queue
        .filter(a => a.status === 'pending' || a.status === 'failed')
        .sort((a, b) => {
          if (a.retryCount !== b.retryCount) return a.retryCount - b.retryCount;
          return a.timestamp - b.timestamp;
        });

      // Apply batch size limit
      const totalPending = pendingActions.length;
      if (totalPending > BATCH_SIZE) {
        console.log(`[SyncQueue] Large queue detected (${totalPending}), processing in batches of ${BATCH_SIZE}`);
        pendingActions = pendingActions.slice(0, BATCH_SIZE);
      }

      console.log(`[SyncQueue] Processing ${pendingActions.length} of ${totalPending} actions...`);

      for (let i = 0; i < pendingActions.length; i++) {
        const action = pendingActions[i];
        
        if (OfflineManager.isOffline()) {
          console.log('[SyncQueue] Went offline during processing, pausing...');
          break;
        }

        // Check if we should retry this action now
        if (action.nextRetryAt && Date.now() < action.nextRetryAt) {
          console.log(`[SyncQueue] Skipping action ${action.id}, retry after ${new Date(action.nextRetryAt).toLocaleTimeString()}`);
          continue;
        }

        await this.processAction(action);
        
        // Add delay between actions, but check for timeout
        if (i < pendingActions.length - 1) {
          const elapsed = Date.now() - this.processingStartTime;
          if (elapsed > 300000) { // 5 minutes max processing time
            console.log('[SyncQueue] Processing timeout reached, pausing...');
            break;
          }
          await this.delay(PROCESSING_DELAY);
        }
      }

      // Schedule next batch if there are more items
      if (totalPending > BATCH_SIZE) {
        console.log(`[SyncQueue] Scheduling next batch in 30 seconds...`);
        setTimeout(() => this.processQueue(), 30000);
      }

    } catch (error) {
      console.error('[SyncQueue] Error during queue processing:', error);
    } finally {
      this.isProcessing = false;
      this.lastSyncTime = Date.now();
      this.saveToStorage();
      this.notifyListeners();

      const duration = Date.now() - this.processingStartTime;
      console.log(`[SyncQueue] Processing complete in ${duration}ms`);
    }
  }

  private async processAction(action: SyncAction): Promise<void> {
    action.status = 'processing';
    action.lastAttempt = Date.now();
    this.saveToStorage();
    this.notifyListeners();

    try {
      const success = await this.executeActionWithTimeout(action);
      
      if (success) {
        action.status = 'completed';
        action.error = undefined;
        action.errorType = undefined;
        console.log(`[SyncQueue] Action ${action.id} completed: ${action.type}`);
        
        // Remove completed actions after a delay
        setTimeout(() => {
          this.dequeue(action.id);
        }, 5000);
      } else {
        throw new Error('Action returned false');
      }
    } catch (error) {
      this.handleActionError(action, error);
    }

    this.saveToStorage();
    this.notifyListeners();
  }

  private async executeActionWithTimeout(action: SyncAction): Promise<boolean> {
    return Promise.race([
      this.executeAction(action),
      new Promise<boolean>((_, reject) => {
        setTimeout(() => reject(new Error('Action timeout')), ACTION_TIMEOUT);
      })
    ]);
  }

  private handleActionError(action: SyncAction, error: any): void {
    action.retryCount++;
    action.error = error instanceof Error ? error.message : String(error);
    action.errorType = this.categorizeError(error);
    
    // Calculate next retry time with exponential backoff
    if (action.retryCount < MAX_RETRY_COUNT) {
      const delayIndex = Math.min(action.retryCount - 1, RETRY_DELAYS.length - 1);
      const delay = RETRY_DELAYS[delayIndex];
      action.nextRetryAt = Date.now() + delay;
      action.status = 'pending';
      
      console.warn(
        `[SyncQueue] Action ${action.id} failed (${action.errorType}), ` +
        `will retry in ${delay}ms (${action.retryCount}/${MAX_RETRY_COUNT})`
      );
    } else {
      action.status = 'failed';
      action.nextRetryAt = undefined;
      console.error(
        `[SyncQueue] Action ${action.id} failed permanently after ${MAX_RETRY_COUNT} retries:`,
        action.error
      );
      
      // Notify about permanent failure
      this.backgroundSyncListeners.forEach(listener => 
        listener('action-failed', { action, error: action.error })
      );
    }
  }

  private categorizeError(error: any): SyncErrorType {
    const message = error instanceof Error ? error.message : String(error);
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('timeout') || lowerMessage.includes('etimedout')) {
      return 'timeout';
    }
    if (lowerMessage.includes('network') || lowerMessage.includes('enotfound') || lowerMessage.includes('econnrefused')) {
      return 'network';
    }
    if (lowerMessage.includes('auth') || lowerMessage.includes('unauthorized') || lowerMessage.includes('forbidden')) {
      return 'auth';
    }
    if (lowerMessage.includes('conflict') || lowerMessage.includes('409')) {
      return 'conflict';
    }
    if (lowerMessage.includes('server') || lowerMessage.includes('500') || lowerMessage.includes('502') || lowerMessage.includes('503')) {
      return 'server';
    }
    
    return 'unknown';
  }

  private async executeAction(action: SyncAction): Promise<boolean> {
    try {
      const result = await window.ipcRenderer.invoke('sync:execute-action', action);
      return result.success;
    } catch (e) {
      console.error('[SyncQueue] IPC error:', e);
      throw e;
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry a specific failed action
   */
  retryAction(actionId: string): boolean {
    const action = this.queue.find(a => a.id === actionId);
    if (action && action.status === 'failed') {
      action.status = 'pending';
      action.retryCount = 0;
      action.error = undefined;
      action.errorType = undefined;
      action.nextRetryAt = undefined;
      this.saveToStorage();
      this.notifyListeners();
      
      // Trigger processing
      if (!OfflineManager.isOffline()) {
        this.processQueue();
      }
      
      return true;
    }
    return false;
  }

  /**
   * Retry all failed actions
   */
  retryAllFailed(): number {
    const failedActions = this.queue.filter(a => a.status === 'failed');
    failedActions.forEach(action => {
      action.status = 'pending';
      action.retryCount = 0;
      action.error = undefined;
      action.errorType = undefined;
      action.nextRetryAt = undefined;
    });
    
    this.saveToStorage();
    this.notifyListeners();
    
    if (failedActions.length > 0 && !OfflineManager.isOffline()) {
      this.processQueue();
    }
    
    return failedActions.length;
  }

  /**
   * Subscribe to queue changes
   */
  subscribe(callback: (state: SyncQueueState) => void): () => void {
    this.listeners.add(callback);
    callback(this.getQueue());
    
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * Subscribe to background sync events
   */
  subscribeToBackgroundSync(callback: (event: string, data: any) => void): () => void {
    this.backgroundSyncListeners.add(callback);
    return () => {
      this.backgroundSyncListeners.delete(callback);
    };
  }

  /**
   * Clear all completed actions
   */
  clearCompleted(): void {
    const beforeCount = this.queue.length;
    this.queue = this.queue.filter(a => a.status !== 'completed');
    const removedCount = beforeCount - this.queue.length;
    if (removedCount > 0) {
      console.log(`[SyncQueue] Cleared ${removedCount} completed actions`);
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  /**
   * Clear all failed actions
   */
  clearFailed(): void {
    const beforeCount = this.queue.length;
    this.queue = this.queue.filter(a => a.status !== 'failed');
    const removedCount = beforeCount - this.queue.length;
    if (removedCount > 0) {
      console.log(`[SyncQueue] Cleared ${removedCount} failed actions`);
      this.saveToStorage();
      this.notifyListeners();
    }
  }

  /**
   * Clear the entire queue
   */
  clearAll(): void {
    this.queue = [];
    this.saveToStorage();
    this.notifyListeners();
  }

  /**
   * Export queue for debugging
   */
  exportQueue(): string {
    return JSON.stringify({
      actions: this.queue,
      lastSyncTime: this.lastSyncTime,
      exportedAt: Date.now(),
      stats: this.getStats()
    }, null, 2);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.unsubscribeOffline) {
      this.unsubscribeOffline();
    }
    this.listeners.clear();
    this.backgroundSyncListeners.clear();
  }
}

// Singleton instance
export const SyncQueue = new SyncQueueManager();

// Hook for React components
export function useSyncQueue() {
  const [state, setState] = React.useState<SyncQueueState>(SyncQueue.getQueue());

  React.useEffect(() => {
    return SyncQueue.subscribe(setState);
  }, []);

  return {
    ...state,
    pendingCount: state.actions.filter(a => a.status === 'pending' || a.status === 'failed').length,
    lastSyncText: SyncQueue.getLastSyncText(),
    stats: SyncQueue.getStats(),
    enqueue: SyncQueue.enqueue.bind(SyncQueue),
    dequeue: SyncQueue.dequeue.bind(SyncQueue),
    processQueue: SyncQueue.processQueue.bind(SyncQueue),
    retryAction: SyncQueue.retryAction.bind(SyncQueue),
    retryAllFailed: SyncQueue.retryAllFailed.bind(SyncQueue),
    clearCompleted: SyncQueue.clearCompleted.bind(SyncQueue),
    clearFailed: SyncQueue.clearFailed.bind(SyncQueue),
    clearAll: SyncQueue.clearAll.bind(SyncQueue),
    exportQueue: SyncQueue.exportQueue.bind(SyncQueue)
  };
}

// Need to import React for the hook
import React from 'react';
