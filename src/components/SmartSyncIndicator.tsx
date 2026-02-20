import React, { useState, useEffect } from 'react';
import styles from './SmartSyncIndicator.module.css';
import { Cloud, Check, AlertCircle } from 'lucide-react';
import { useSyncQueue } from '../utils/SyncQueue';
import { useOfflineStatus } from '../hooks/useOfflineStatus';

interface SmartSyncIndicatorProps {
  minimal?: boolean;
  showWhenSynced?: boolean;
}

export const SmartSyncIndicator: React.FC<SmartSyncIndicatorProps> = ({ 
  minimal = false,
  showWhenSynced = false
}) => {
  const isOffline = useOfflineStatus();
  const { pendingCount, stats, isProcessing, lastSyncText } = useSyncQueue();
  const [isVisible, setIsVisible] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Determine if we should show the indicator
  useEffect(() => {
    const shouldShow = 
      isOffline || 
      pendingCount > 0 || 
      stats?.failed > 0 || 
      (showWhenSynced && !isOffline && pendingCount === 0);
    
    setIsVisible(shouldShow);
  }, [isOffline, pendingCount, stats?.failed, showWhenSynced]);

  // Show success state briefly after sync completes
  useEffect(() => {
    if (!isProcessing && pendingCount === 0 && !isOffline) {
      setShowSuccess(true);
      const timer = setTimeout(() => {
        setShowSuccess(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isProcessing, pendingCount, isOffline]);

  // Don't render if not visible and not showing success
  if (!isVisible && !showSuccess) return null;

  // Determine icon and style based on state
  const getStatusConfig = () => {
    if (showSuccess && !isOffline) {
      return {
        icon: <Check size={minimal ? 12 : 14} />,
        className: styles.success,
        label: minimal ? '' : 'Synced'
      };
    }
    
    if (isOffline) {
      return {
        icon: <Cloud size={minimal ? 12 : 14} className={styles.offlineIcon} />,
        className: styles.offline,
        label: minimal ? '' : 'Offline'
      };
    }
    
    if (stats?.failed > 0 && !isProcessing) {
      return {
        icon: <AlertCircle size={minimal ? 12 : 14} className={styles.errorIcon} />,
        className: styles.error,
        label: minimal ? `${stats.failed}` : `${stats.failed} failed`
      };
    }
    
    if (isProcessing) {
      return {
        icon: <Cloud size={minimal ? 12 : 14} className={styles.syncingIcon} />,
        className: styles.syncing,
        label: minimal ? '' : 'Syncing...'
      };
    }
    
    return {
      icon: <Cloud size={minimal ? 12 : 14} className={styles.pendingIcon} />,
      className: styles.pending,
      label: minimal ? `${pendingCount}` : `${pendingCount} pending`
    };
  };

  const config = getStatusConfig();

  if (minimal) {
    return (
      <div 
        className={`${styles.minimalContainer} ${config.className}`}
        title={isOffline ? 'Working offline' : lastSyncText}
      >
        {config.icon}
        {config.label && <span className={styles.minimalLabel}>{config.label}</span>}
      </div>
    );
  }

  return (
    <div className={`${styles.container} ${config.className}`}>
      {config.icon}
      <span className={styles.label}>{config.label}</span>
      {!isOffline && pendingCount > 0 && !isProcessing && (
        <span className={styles.count}>{pendingCount}</span>
      )}
    </div>
  );
};

// Hook to check if sync indicator should be shown
export function useShouldShowSyncIndicator(): boolean {
  const isOffline = useOfflineStatus();
  const { pendingCount, stats } = useSyncQueue();
  
  return isOffline || pendingCount > 0 || (stats?.failed || 0) > 0;
}
