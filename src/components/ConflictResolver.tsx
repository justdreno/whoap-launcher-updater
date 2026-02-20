import React, { useState, useEffect } from 'react';
import styles from './ConflictResolver.module.css';
import { Instance } from '../api/instances';
import { CloudManager } from '../utils/CloudManager';
import { 
  AlertTriangle, 
  Laptop, 
  Cloud, 
  Check, 
  X,
  RefreshCw,
  ArrowLeftRight
} from 'lucide-react';

export interface Conflict {
  instanceName: string;
  localInstance?: Instance;
  cloudInstance?: Instance;
  type: 'modified' | 'deleted-locally' | 'deleted-cloud' | 'new-local' | 'new-cloud';
  localUpdatedAt: number;
  cloudUpdatedAt: number;
}

interface ConflictResolverProps {
  userId: string;
  onResolved?: () => void;
  onClose?: () => void;
}

export const ConflictResolver: React.FC<ConflictResolverProps> = ({ 
  userId, 
  onResolved, 
  onClose 
}) => {
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState<Set<string>>(new Set());
  const [resolved, setResolved] = useState<Set<string>>(new Set());

  useEffect(() => {
    detectConflicts();
  }, [userId]);

  const detectConflicts = async () => {
    setLoading(true);
    try {
      // Get local instances
      const { InstanceApi } = await import('../api/instances');
      const localInstances = await InstanceApi.list();

      // Get cloud instances
      const cloudInstances = await CloudManager.fetchInstances(userId);

      const detectedConflicts: Conflict[] = [];
      const localMap = new Map(localInstances.map(i => [i.name, i]));
      const cloudMap = new Map(cloudInstances.map(i => [i.name, i]));

      // Check for conflicts
      const allNames = new Set([...localMap.keys(), ...cloudMap.keys()]);

      for (const name of allNames) {
        const local = localMap.get(name);
        const cloud = cloudMap.get(name);

        if (local && cloud) {
          // Both exist - check if modified
          if (local.version !== cloud.version || local.loader !== cloud.loader) {
            detectedConflicts.push({
              instanceName: name,
              localInstance: local,
              cloudInstance: cloud,
              type: 'modified',
              localUpdatedAt: local.lastPlayed || local.created,
              cloudUpdatedAt: cloud.lastPlayed || cloud.created
            });
          }
        } else if (local && !cloud) {
          // Only local exists - new local instance
          detectedConflicts.push({
            instanceName: name,
            localInstance: local,
            type: 'new-local',
            localUpdatedAt: local.created,
            cloudUpdatedAt: 0
          });
        } else if (!local && cloud) {
          // Only cloud exists - new cloud instance
          detectedConflicts.push({
            instanceName: name,
            cloudInstance: cloud,
            type: 'new-cloud',
            localUpdatedAt: 0,
            cloudUpdatedAt: cloud.created
          });
        }
      }

      setConflicts(detectedConflicts);
    } catch (e) {
      console.error('[ConflictResolver] Failed to detect conflicts:', e);
    } finally {
      setLoading(false);
    }
  };

  const resolveConflict = async (conflict: Conflict, choice: 'local' | 'cloud' | 'merge') => {
    setResolving(prev => new Set(prev).add(conflict.instanceName));

    try {
      const { InstanceApi } = await import('../api/instances');

      switch (choice) {
        case 'local':
          if (conflict.localInstance) {
            // Upload local to cloud
            await CloudManager.saveInstance(conflict.localInstance, userId);
          }
          break;

        case 'cloud':
          if (conflict.cloudInstance) {
            if (conflict.localInstance) {
              // Update local instance
              await InstanceApi.delete(conflict.localInstance.id);
            }
            // Import from cloud
            await InstanceApi.create(
              conflict.cloudInstance.name,
              conflict.cloudInstance.version,
              conflict.cloudInstance.loader
            );
          }
          break;

        case 'merge':
          // For now, use the newer version
          if (conflict.localUpdatedAt > conflict.cloudUpdatedAt) {
            await CloudManager.saveInstance(conflict.localInstance!, userId);
          } else {
            await InstanceApi.delete(conflict.localInstance!.id);
            await InstanceApi.create(
              conflict.cloudInstance!.name,
              conflict.cloudInstance!.version,
              conflict.cloudInstance!.loader
            );
          }
          break;
      }

      setResolved(prev => new Set(prev).add(conflict.instanceName));
      
      // Remove from conflicts after a delay
      setTimeout(() => {
        setConflicts(prev => prev.filter(c => c.instanceName !== conflict.instanceName));
      }, 500);

    } catch (e) {
      console.error('[ConflictResolver] Failed to resolve:', e);
    } finally {
      setResolving(prev => {
        const next = new Set(prev);
        next.delete(conflict.instanceName);
        return next;
      });
    }
  };

  const resolveAll = async (choice: 'local' | 'cloud' | 'merge') => {
    for (const conflict of conflicts) {
      if (!resolved.has(conflict.instanceName)) {
        await resolveConflict(conflict, choice);
      }
    }
    onResolved?.();
  };

  const formatDate = (timestamp: number) => {
    if (!timestamp) return 'Unknown';
    return new Date(timestamp).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <div className={styles.loading}>
            <RefreshCw className={styles.spinner} size={24} />
            <span>Checking for conflicts...</span>
          </div>
        </div>
      </div>
    );
  }

  if (conflicts.length === 0) {
    return (
      <div className={styles.overlay}>
        <div className={styles.modal}>
          <div className={styles.success}>
            <Check className={styles.successIcon} size={48} />
            <h3>No Conflicts Found</h3>
            <p>Your local and cloud instances are in sync.</p>
            <button className={styles.closeBtn} onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <AlertTriangle className={styles.warningIcon} size={24} />
            <h2>Sync Conflicts Detected</h2>
          </div>
          <p className={styles.subtitle}>
            {conflicts.length} instance{conflicts.length > 1 ? 's' : ''} have conflicting changes between local and cloud.
          </p>
          <button className={styles.dismissBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.bulkActions}>
          <span className={styles.bulkLabel}>Resolve All:</span>
          <button 
            className={styles.bulkBtn} 
            onClick={() => resolveAll('local')}
            disabled={resolving.size > 0}
          >
            <Laptop size={14} />
            Use Local
          </button>
          <button 
            className={styles.bulkBtn} 
            onClick={() => resolveAll('cloud')}
            disabled={resolving.size > 0}
          >
            <Cloud size={14} />
            Use Cloud
          </button>
          <button 
            className={styles.bulkBtn} 
            onClick={() => resolveAll('merge')}
            disabled={resolving.size > 0}
          >
            <ArrowLeftRight size={14} />
            Use Newest
          </button>
        </div>

        <div className={styles.conflictsList}>
          {conflicts.map(conflict => (
            <div 
              key={conflict.instanceName}
              className={`${styles.conflictCard} ${resolved.has(conflict.instanceName) ? styles.resolved : ''}`}
            >
              <div className={styles.conflictHeader}>
                <span className={styles.instanceName}>{conflict.instanceName}</span>
                <span className={styles.conflictType}>
                  {conflict.type === 'modified' && 'Modified'}
                  {conflict.type === 'new-local' && 'New (Local)'}
                  {conflict.type === 'new-cloud' && 'New (Cloud)'}
                </span>
              </div>

              <div className={styles.comparison}>
                {conflict.localInstance && (
                  <div className={styles.side}>
                    <div className={styles.sideHeader}>
                      <Laptop size={14} />
                      <span>Local</span>
                    </div>
                    <div className={styles.sideContent}>
                      <div className={styles.infoRow}>
                        <span className={styles.label}>Version:</span>
                        <span className={styles.value}>{conflict.localInstance.version}</span>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.label}>Loader:</span>
                        <span className={styles.value}>{conflict.localInstance.loader}</span>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.label}>Updated:</span>
                        <span className={styles.value}>{formatDate(conflict.localUpdatedAt)}</span>
                      </div>
                    </div>
                  </div>
                )}

                {conflict.cloudInstance && (
                  <div className={styles.side}>
                    <div className={styles.sideHeader}>
                      <Cloud size={14} />
                      <span>Cloud</span>
                    </div>
                    <div className={styles.sideContent}>
                      <div className={styles.infoRow}>
                        <span className={styles.label}>Version:</span>
                        <span className={styles.value}>{conflict.cloudInstance.version}</span>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.label}>Loader:</span>
                        <span className={styles.value}>{conflict.cloudInstance.loader}</span>
                      </div>
                      <div className={styles.infoRow}>
                        <span className={styles.label}>Updated:</span>
                        <span className={styles.value}>{formatDate(conflict.cloudUpdatedAt)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.actions}>
                <button 
                  className={styles.actionBtn}
                  onClick={() => resolveConflict(conflict, 'local')}
                  disabled={resolving.has(conflict.instanceName)}
                >
                  {resolving.has(conflict.instanceName) ? (
                    <RefreshCw className={styles.spinner} size={14} />
                  ) : (
                    <>
                      <Laptop size={14} />
                      Use Local
                    </>
                  )}
                </button>
                <button 
                  className={styles.actionBtn}
                  onClick={() => resolveConflict(conflict, 'cloud')}
                  disabled={resolving.has(conflict.instanceName)}
                >
                  {resolving.has(conflict.instanceName) ? (
                    <RefreshCw className={styles.spinner} size={14} />
                  ) : (
                    <>
                      <Cloud size={14} />
                      Use Cloud
                    </>
                  )}
                </button>
                <button 
                  className={styles.actionBtn}
                  onClick={() => resolveConflict(conflict, 'merge')}
                  disabled={resolving.has(conflict.instanceName)}
                  title="Uses the most recently updated version"
                >
                  {resolving.has(conflict.instanceName) ? (
                    <RefreshCw className={styles.spinner} size={14} />
                  ) : (
                    <>
                      <ArrowLeftRight size={14} />
                      Use Newest
                    </>
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
