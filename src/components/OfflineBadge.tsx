import React from 'react';
import styles from './OfflineBadge.module.css';
import { Cloud, CheckCircle, WifiOff } from 'lucide-react';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { useSyncQueue } from '../utils/SyncQueue';

interface OfflineBadgeProps {
  instanceId?: string;
  showTooltip?: boolean;
  size?: 'small' | 'medium';
}

export const OfflineBadge: React.FC<OfflineBadgeProps> = ({ 
  instanceId,
  showTooltip = true,
  size = 'small'
}) => {
  const isOffline = useOfflineStatus();
  const { pendingCount } = useSyncQueue();

  // Check if this instance has pending sync actions
  const hasPendingChanges = instanceId && pendingCount > 0;

  if (isOffline) {
    return (
      <div 
        className={`${styles.badge} ${styles.offline} ${styles[size]}`}
        title={showTooltip ? 'Working offline - changes will sync when online' : undefined}
      >
        <WifiOff size={size === 'small' ? 10 : 12} />
        <span>Offline</span>
      </div>
    );
  }

  if (hasPendingChanges) {
    return (
      <div 
        className={`${styles.badge} ${styles.syncing} ${styles[size]}`}
        title={showTooltip ? `${pendingCount} change(s) pending sync` : undefined}
      >
        <Cloud size={size === 'small' ? 10 : 12} className={styles.syncingIcon} />
        <span>Syncing</span>
      </div>
    );
  }

  return (
    <div 
      className={`${styles.badge} ${styles.ready} ${styles[size]}`}
      title={showTooltip ? 'All changes synced' : undefined}
    >
      <CheckCircle size={size === 'small' ? 10 : 12} />
      <span>Ready</span>
    </div>
  );
};

// Compact dot version
export const OfflineStatusDot: React.FC<{ instanceId?: string }> = ({ instanceId }) => {
  const isOffline = useOfflineStatus();
  const { pendingCount } = useSyncQueue();
  const hasPendingChanges = instanceId && pendingCount > 0;

  if (isOffline) {
    return (
      <span 
        className={`${styles.dot} ${styles.offlineDot}`}
        title="Working offline"
      />
    );
  }

  if (hasPendingChanges) {
    return (
      <span 
        className={`${styles.dot} ${styles.syncingDot}`}
        title="Changes pending sync"
      />
    );
  }

  return (
    <span 
      className={`${styles.dot} ${styles.readyDot}`}
      title="All synced"
    />
  );
};

export default OfflineBadge;
