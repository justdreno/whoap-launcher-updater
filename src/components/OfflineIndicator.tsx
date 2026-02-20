import React from 'react';
import styles from './OfflineIndicator.module.css';
import { WifiOff } from 'lucide-react';
import { useOfflineStatus } from '../hooks/useOfflineStatus';

interface OfflineIndicatorProps {
  showLabel?: boolean;
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ 
  showLabel = true,
  size = 'small',
  className 
}) => {
  const isOffline = useOfflineStatus();

  if (!isOffline) return null;

  const sizeClass = styles[size];

  return (
    <div className={`${styles.container} ${sizeClass} ${className || ''}`}>
      <WifiOff className={styles.icon} />
      {showLabel && <span className={styles.label}>Offline</span>}
    </div>
  );
};

// Inline version for use in headers/buttons
export const OfflineDot: React.FC = () => {
  const isOffline = useOfflineStatus();
  
  if (!isOffline) return null;

  return (
    <span 
      className={styles.offlineDot}
      title="You're working offline"
    />
  );
};

// Subtle border indicator
export const OfflineBorder: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isOffline = useOfflineStatus();
  
  return (
    <div className={`${styles.borderContainer} ${isOffline ? styles.offline : ''}`}>
      {children}
    </div>
  );
};
