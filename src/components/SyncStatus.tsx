import React, { useState, useEffect } from 'react';
import styles from './SyncStatus.module.css';
import { Cloud, CloudOff, Check, AlertCircle, RefreshCw, X, Trash2, RotateCcw, List, HelpCircle } from 'lucide-react';
import { useSyncQueue } from '../utils/SyncQueue';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { useToast } from '../context/ToastContext';
import { SyncQueueViewer } from './SyncQueueViewer';
import { OfflineHelp } from './OfflineHelp';

export const SyncStatus: React.FC = () => {
    const isOffline = useOfflineStatus();
    const { 
        pendingCount, 
        lastSyncText, 
        isProcessing, 
        processQueue,
        stats,
        retryAllFailed,
        clearCompleted
    } = useSyncQueue();
    const { showToast } = useToast();
    const [showDetails, setShowDetails] = useState(false);
    const [showViewer, setShowViewer] = useState(false);
    const [showHelp, setShowHelp] = useState(false);
    const [animate, setAnimate] = useState(false);
    const [syncProgress, setSyncProgress] = useState(0);

    // Animate when pending count changes
    useEffect(() => {
        if (pendingCount > 0) {
            setAnimate(true);
            const timer = setTimeout(() => setAnimate(false), 500);
            return () => clearTimeout(timer);
        }
    }, [pendingCount]);

    const handleSync = async () => {
        if (!isOffline && pendingCount > 0) {
            setSyncProgress(0);
            await processQueue();
            setSyncProgress(100);
            setTimeout(() => setSyncProgress(0), 1000);
        }
    };

    const handleRetryFailed = async () => {
        const retried = retryAllFailed();
        if (retried > 0) {
            showToast(`Retrying ${retried} failed actions`, 'info');
        }
    };

    const handleClearCompleted = () => {
        clearCompleted();
        showToast('Cleared completed actions', 'success');
    };

    // Don't show if no pending items and we're synced
    if (pendingCount === 0 && !isOffline) {
        return (
            <div className={styles.container} title={`Last synced: ${lastSyncText}`}>
                <Check size={14} className={styles.syncedIcon} />
                <span className={styles.text}>Synced</span>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <button
                className={`${styles.statusButton} ${animate ? styles.pulse : ''}`}
                onClick={() => setShowDetails(!showDetails)}
                title={isOffline ? 'Offline - changes will sync when online' : `${pendingCount} changes pending sync`}
            >
                {isOffline ? (
                    <CloudOff size={14} className={styles.offlineIcon} />
                ) : pendingCount > 0 ? (
                    <>
                        <Cloud size={14} className={styles.pendingIcon} />
                        <span className={styles.badge}>{pendingCount}</span>
                    </>
                ) : (
                    <Check size={14} className={styles.syncedIcon} />
                )}
                <span className={styles.text}>
                    {isOffline ? 'Offline' : pendingCount > 0 ? `${pendingCount} pending` : 'Synced'}
                </span>
            </button>

            {showDetails && (
                <div className={styles.details}>
                    <div className={styles.detailsHeader}>
                        <h4>Sync Status</h4>
                        <button 
                            className={styles.closeBtn}
                            onClick={() => setShowDetails(false)}
                        >
                            <X size={14} />
                        </button>
                    </div>

                    <div className={styles.statusInfo}>
                        <div className={styles.statusRow}>
                            <span className={styles.label}>Status:</span>
                            <span className={styles.value}>
                                {isOffline ? (
                                    <span className={styles.offline}>Offline</span>
                                ) : isProcessing ? (
                                    <span className={styles.processing}>
                                        <RefreshCw size={12} className={styles.spin} />
                                        Syncing...
                                    </span>
                                ) : pendingCount > 0 ? (
                                    <span className={styles.pending}>
                                        <AlertCircle size={12} />
                                        {pendingCount} changes pending
                                    </span>
                                ) : (
                                    <span className={styles.synced}>
                                        <Check size={12} />
                                        All synced
                                    </span>
                                )}
                            </span>
                        </div>
                        <div className={styles.statusRow}>
                            <span className={styles.label}>Last sync:</span>
                            <span className={styles.value}>{lastSyncText}</span>
                        </div>
                        {stats && (
                            <>
                                <div className={styles.statsGrid}>
                                    <div className={styles.statItem}>
                                        <span className={styles.statValue}>{stats.total}</span>
                                        <span className={styles.statLabel}>Total</span>
                                    </div>
                                    <div className={styles.statItem}>
                                        <span className={styles.statValue}>{stats.pending}</span>
                                        <span className={styles.statLabel}>Pending</span>
                                    </div>
                                    <div className={styles.statItem}>
                                        <span className={styles.statValue}>{stats.processing}</span>
                                        <span className={styles.statLabel}>Active</span>
                                    </div>
                                    <div className={styles.statItem}>
                                        <span className={`${styles.statValue} ${styles.failed}`}>{stats.failed}</span>
                                        <span className={styles.statLabel}>Failed</span>
                                    </div>
                                </div>
                                {stats.avgRetryCount > 0 && (
                                    <div className={styles.retryInfo}>
                                        Avg retries: {stats.avgRetryCount.toFixed(1)}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {!isOffline && pendingCount > 0 && (
                        <>
                            {syncProgress > 0 && (
                                <div className={styles.progressBar}>
                                    <div 
                                        className={styles.progressFill} 
                                        style={{ width: `${syncProgress}%` }}
                                    />
                                </div>
                            )}
                            <button
                                className={styles.syncButton}
                                onClick={handleSync}
                                disabled={isProcessing}
                            >
                                <RefreshCw size={14} className={isProcessing ? styles.spin : ''} />
                                {isProcessing ? 'Syncing...' : 'Sync Now'}
                            </button>
                        </>
                    )}

                    {stats?.failed > 0 && (
                        <button
                            className={styles.secondaryBtn}
                            onClick={handleRetryFailed}
                            disabled={isProcessing}
                        >
                            <RotateCcw size={14} />
                            Retry {stats.failed} Failed
                        </button>
                    )}

                    {stats?.completed > 0 && (
                        <button
                            className={styles.tertiaryBtn}
                            onClick={handleClearCompleted}
                        >
                            <Trash2 size={14} />
                            Clear Completed
                        </button>
                    )}

                    <button
                        className={styles.viewAllBtn}
                        onClick={() => {
                            setShowDetails(false);
                            setShowViewer(true);
                        }}
                    >
                        <List size={14} />
                        View All Actions
                    </button>

                    <button
                        className={styles.helpBtn}
                        onClick={() => {
                            setShowDetails(false);
                            setShowHelp(true);
                        }}
                    >
                        <HelpCircle size={14} />
                        How does sync work?
                    </button>

                    {isOffline && pendingCount > 0 && (
                        <p className={styles.hint}>
                            Connect to the internet to sync {pendingCount} pending changes.
                        </p>
                    )}
                </div>
            )}

            {showViewer && (
                <SyncQueueViewer onClose={() => setShowViewer(false)} />
            )}

            {showHelp && (
                <OfflineHelp onClose={() => setShowHelp(false)} />
            )}
        </div>
    );
};
