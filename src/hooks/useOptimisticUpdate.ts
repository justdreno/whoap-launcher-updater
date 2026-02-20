import { useState, useCallback } from 'react';
import { useOfflineStatus } from './useOfflineStatus';
import { SyncQueue, SyncQueueState } from '../utils/SyncQueue';

export interface OptimisticState<T> {
  data: T;
  status: 'idle' | 'pending' | 'success' | 'error';
  error?: string;
  syncId?: string;
}

export function useOptimisticUpdate<T>(
  initialData: T,
  syncAction: (data: T) => { type: any; payload: any }
) {
  const [state, setState] = useState<OptimisticState<T>>({
    data: initialData,
    status: 'idle'
  });
  
  const isOffline = useOfflineStatus();

  const updateOptimistically = useCallback((newData: T, userId?: string, token?: string) => {
    // Immediately update UI (optimistic)
    setState({
      data: newData,
      status: 'pending'
    });

    // Queue for sync if user is provided
    if (userId) {
      const { type, payload } = syncAction(newData);
      const syncId = SyncQueue.enqueue(type, {
        ...payload,
        userId,
        token
      });

      setState(prev => ({
        ...prev,
        syncId
      }));

      // Subscribe to sync completion
      const unsubscribe = SyncQueue.subscribe((queueState: SyncQueueState) => {
        const action = queueState.actions.find((a: any) => a.id === syncId);
        if (action) {
          if (action.status === 'completed') {
            setState(prev => ({
              ...prev,
              status: 'success'
            }));
            unsubscribe();
          } else if (action.status === 'failed') {
            setState(prev => ({
              ...prev,
              status: 'error',
              error: action.error
            }));
            unsubscribe();
          }
        }
      });
    } else if (!isOffline) {
      // If online but no user, still show success after a delay
      setTimeout(() => {
        setState(prev => ({
          ...prev,
          status: 'success'
        }));
      }, 500);
    }
  }, [isOffline, syncAction]);

  const reset = useCallback(() => {
    setState({
      data: initialData,
      status: 'idle'
    });
  }, [initialData]);

  return {
    ...state,
    updateOptimistically,
    reset,
    isOffline
  };
}

// Hook specifically for instance operations
export function useOptimisticInstance() {
  return {
    create: (instance: any, userId?: string, token?: string) => {
      return {
        type: 'instance:create' as const,
        payload: { instance, userId, token }
      };
    },
    update: (instance: any, userId?: string, token?: string) => {
      return {
        type: 'instance:update' as const,
        payload: { instance, userId, token }
      };
    },
    delete: (instanceName: string, userId?: string) => {
      return {
        type: 'instance:delete' as const,
        payload: { instanceName, userId }
      };
    }
  };
}
