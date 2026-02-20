import React, { useState } from 'react';
import styles from './SyncQueueViewer.module.css';
import { useSyncQueue, SyncAction } from '../utils/SyncQueue';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { 
  X, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  Clock,
  ChevronDown,
  ChevronUp,
  Download,
  Trash2,
  RotateCcw,
  Play
} from 'lucide-react';

interface SyncQueueViewerProps {
  onClose: () => void;
}

export const SyncQueueViewer: React.FC<SyncQueueViewerProps> = ({ onClose }) => {
  const isOffline = useOfflineStatus();
  const { 
    actions, 
    isProcessing, 
    lastSyncTime,
    stats,
    pendingCount,
    processQueue,
    retryAction,
    retryAllFailed,
    dequeue,
    clearCompleted,
    clearFailed,
    clearAll,
    exportQueue
  } = useSyncQueue();

  const [expandedAction, setExpandedAction] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'failed' | 'completed'>('all');

  const filteredActions = actions.filter(action => {
    if (activeTab === 'all') return true;
    return action.status === activeTab;
  });

  const getActionIcon = (action: SyncAction) => {
    switch (action.status) {
      case 'completed':
        return <CheckCircle size={16} className={styles.completedIcon} />;
      case 'failed':
        return <AlertCircle size={16} className={styles.failedIcon} />;
      case 'processing':
        return <RefreshCw size={16} className={styles.processingIcon} />;
      default:
        return <Clock size={16} className={styles.pendingIcon} />;
    }
  };

  const getActionTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'instance:create': 'Create Instance',
      'instance:update': 'Update Instance',
      'instance:delete': 'Delete Instance',
      'settings:update': 'Update Settings',
      'skin:update': 'Update Skin',
      'cape:update': 'Update Cape',
      'friend:request': 'Friend Request',
      'friend:accept': 'Accept Friend',
      'friend:remove': 'Remove Friend'
    };
    return labels[type] || type;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatRelativeTime = (timestamp: number) => {
    const diff = Date.now() - timestamp;
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  };

  const handleExport = () => {
    const data = exportQueue();
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sync-queue-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2>Sync Queue</h2>
            <span className={styles.subtitle}>
              {isProcessing ? (
                <span className={styles.processingBadge}>
                  <RefreshCw size={12} className={styles.spin} />
                  Processing...
                </span>
              ) : isOffline ? (
                <span className={styles.offlineBadge}>Offline</span>
              ) : pendingCount > 0 ? (
                <span className={styles.pendingBadge}>{pendingCount} pending</span>
              ) : (
                <span className={styles.syncedBadge}>All synced</span>
              )}
            </span>
          </div>
          <div className={styles.headerActions}>
            <button className={styles.iconBtn} onClick={handleExport} title="Export Queue">
              <Download size={18} />
            </button>
            <button className={styles.iconBtn} onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>

        <div className={styles.statsBar}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats?.total || 0}</span>
            <span className={styles.statLabel}>Total</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats?.pending || 0}</span>
            <span className={styles.statLabel}>Pending</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{stats?.processing || 0}</span>
            <span className={styles.statLabel}>Processing</span>
          </div>
          <div className={styles.stat}>
            <span className={`${styles.statValue} ${styles.failed}`}>{stats?.failed || 0}</span>
            <span className={styles.statLabel}>Failed</span>
          </div>
          <div className={styles.stat}>
            <span className={`${styles.statValue} ${styles.success}`}>{stats?.completed || 0}</span>
            <span className={styles.statLabel}>Completed</span>
          </div>
        </div>

        <div className={styles.toolbar}>
          <div className={styles.tabs}>
            <button 
              className={`${styles.tab} ${activeTab === 'all' ? styles.active : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All
            </button>
            <button 
              className={`${styles.tab} ${activeTab === 'pending' ? styles.active : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              Pending
            </button>
            <button 
              className={`${styles.tab} ${activeTab === 'failed' ? styles.active : ''}`}
              onClick={() => setActiveTab('failed')}
            >
              Failed
            </button>
            <button 
              className={`${styles.tab} ${activeTab === 'completed' ? styles.active : ''}`}
              onClick={() => setActiveTab('completed')}
            >
              Completed
            </button>
          </div>

          <div className={styles.actions}>
            {stats?.failed > 0 && (
              <button 
                className={styles.actionBtn}
                onClick={retryAllFailed}
                disabled={isOffline}
              >
                <RotateCcw size={14} />
                Retry All Failed
              </button>
            )}
            {!isOffline && pendingCount > 0 && (
              <button 
                className={styles.primaryBtn}
                onClick={processQueue}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <>
                    <RefreshCw size={14} className={styles.spin} />
                    Processing...
                  </>
                ) : (
                  <>
                    <Play size={14} />
                    Sync Now
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        <div className={styles.list}>
          {filteredActions.length === 0 ? (
            <div className={styles.empty}>
              <CheckCircle size={48} className={styles.emptyIcon} />
              <p>No {activeTab === 'all' ? '' : activeTab} actions</p>
              <span className={styles.emptySub}>
                {activeTab === 'all' ? 'Everything is up to date!' : `No ${activeTab} actions found`}
              </span>
            </div>
          ) : (
            filteredActions.map((action) => (
              <div 
                key={action.id}
                className={`${styles.action} ${styles[action.status]}`}
              >
                <div 
                  className={styles.actionHeader}
                  onClick={() => setExpandedAction(expandedAction === action.id ? null : action.id)}
                >
                  <div className={styles.actionLeft}>
                    {getActionIcon(action)}
                    <div className={styles.actionInfo}>
                      <span className={styles.actionType}>
                        {getActionTypeLabel(action.type)}
                      </span>
                      <span className={styles.actionTime}>
                        {formatRelativeTime(action.timestamp)}
                      </span>
                    </div>
                  </div>

                  <div className={styles.actionRight}>
                    {action.status === 'failed' && (
                      <button 
                        className={styles.retryBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          retryAction(action.id);
                        }}
                        disabled={isOffline}
                      >
                        <RotateCcw size={14} />
                      </button>
                    )}
                    <button 
                      className={styles.deleteBtn}
                      onClick={(e) => {
                        e.stopPropagation();
                        dequeue(action.id);
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                    {expandedAction === action.id ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </div>
                </div>

                {expandedAction === action.id && (
                  <div className={styles.actionDetails}>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>ID:</span>
                      <span className={styles.detailValue}>{action.id}</span>
                    </div>
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Created:</span>
                      <span className={styles.detailValue}>{formatTime(action.timestamp)}</span>
                    </div>
                    {action.lastAttempt && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Last Attempt:</span>
                        <span className={styles.detailValue}>{formatTime(action.lastAttempt)}</span>
                      </div>
                    )}
                    {action.retryCount > 0 && (
                      <div className={styles.detailRow}>
                        <span className={styles.detailLabel}>Retry Count:</span>
                        <span className={styles.detailValue}>{action.retryCount}</span>
                      </div>
                    )}
                    {action.error && (
                      <div className={styles.errorRow}>
                        <span className={styles.detailLabel}>Error:</span>
                        <span className={styles.errorValue}>{action.error}</span>
                      </div>
                    )}
                    <div className={styles.detailRow}>
                      <span className={styles.detailLabel}>Payload:</span>
                      <pre className={styles.payload}>
                        {JSON.stringify(action.payload, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            {lastSyncTime && (
              <span className={styles.lastSync}>
                Last sync: {new Date(lastSyncTime).toLocaleString()}
              </span>
            )}
          </div>
          <div className={styles.footerRight}>
            {stats?.completed > 0 && (
              <button className={styles.footerBtn} onClick={clearCompleted}>
                <Trash2 size={14} />
                Clear Completed
              </button>
            )}
            {stats?.failed > 0 && (
              <button className={styles.footerBtn} onClick={clearFailed}>
                <Trash2 size={14} />
                Clear Failed
              </button>
            )}
            <button className={styles.footerBtn} onClick={clearAll}>
              <Trash2 size={14} />
              Clear All
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
