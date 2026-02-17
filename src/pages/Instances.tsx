import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Settings, RefreshCw, FolderOpen, Clock, Star, Library, Plus } from 'lucide-react';
import { Instance, InstanceApi } from '../api/instances';
import { CreateInstanceModal } from '../components/CreateInstanceModal';
import { InstanceSettingsModal } from '../components/InstanceSettingsModal';
import { ProcessingModal } from '../components/ProcessingModal';
import styles from './Instances.module.css';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../context/ToastContext';

interface InstancesProps {
    onSelectInstance?: (instance: Instance) => void;
    onNavigate?: (tab: string, instanceId?: string) => void;
}

export const Instances: React.FC<InstancesProps> = ({ onSelectInstance, onNavigate }) => {
    const [instances, setInstances] = useState<Instance[]>([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [loading, setLoading] = useState(true);
    const [settingsInstance, setSettingsInstance] = useState<Instance | null>(null);
    const [processing, setProcessing] = useState<{ message: string; subMessage?: string; progress?: number } | null>(null);
    const { showToast } = useToast();

    const handleToggleFavorite = async (e: React.MouseEvent, instance: Instance) => {
        e.stopPropagation();
        await InstanceApi.toggleFavorite(instance.id);
        const list = await InstanceApi.list();
        setInstances(list);
        showToast(instance.isFavorite ? 'Removed from favorites' : 'Added to favorites', 'success');
    };

    const loadInstances = async () => {
        setLoading(true);
        try {
            const localList = await InstanceApi.list();
            
            // Only show local instances
            // Cloud instances are synced when created, but if deleted locally, 
            // they should stay deleted. Users can re-import from cloud if needed.
            setInstances(localList);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleCreated = async () => {
        await loadInstances();
        // Cloud sync removed - instances are now local only
    };

    useEffect(() => {
        loadInstances();

        const handleProgress = (_: any, data: any) => {
            setProcessing(prev => prev ? { ...prev, subMessage: data.status, progress: data.progress } : null);
        };
        window.ipcRenderer.on('instance:import-progress', handleProgress);
        return () => {
            window.ipcRenderer.off('instance:import-progress', handleProgress);
        };
    }, []);

    // Keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger shortcuts when typing in input fields
            if (e.target instanceof HTMLInputElement || 
                e.target instanceof HTMLTextAreaElement ||
                (e.target as HTMLElement).isContentEditable) {
                return;
            }

            if (e.ctrlKey || e.metaKey) {
                switch (e.key.toLowerCase()) {
                    case 'n':
                        e.preventDefault();
                        setShowCreateModal(true);
                        break;
                    case 'r':
                        e.preventDefault();
                        loadInstances();
                        break;
                    case 'i':
                        e.preventDefault();
                        const importInstance = async () => {
                            setProcessing({ message: 'Importing Instance...', subMessage: 'Initializing...', progress: 0 });
                            try {
                                const res = await InstanceApi.import();
                                if (res.success) {
                                    showToast('Instance imported successfully!', 'success');
                                    loadInstances();
                                }
                                else if (res.error) showToast(res.error, 'error');
                            } finally {
                                setProcessing(null);
                            }
                        };
                        importInstance();
                        break;
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [loadInstances]);

    return (
        <div className={styles.container}>
            <PageHeader
                title="Profiles"
                description="Manage your Minecraft instances and versions."
            />

            <div className={styles.header}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
                    <button className={styles.refreshBtn} onClick={loadInstances} title="Refresh List">
                        <RefreshCw size={20} />
                    </button>
                    <button className={styles.importBtn} onClick={async () => {
                        setProcessing({ message: 'Importing Instance...', subMessage: 'Initializing...', progress: 0 });
                        try {
                            const res = await InstanceApi.import();
                            if (res.success) {
                                showToast('Instance imported successfully!', 'success');
                                loadInstances();
                            }
                            else if (res.error) showToast(res.error, 'error');
                        } finally {
                            setProcessing(null);
                        }
                    }}>
                        Import Profile
                    </button>
                    <button className={styles.importBtn} onClick={async () => {
                        setProcessing({ message: 'Importing Custom Client...', subMessage: 'Reading archive...', progress: 0 });
                        try {
                            const res = await InstanceApi.importCustomClient();
                            if (res.success) {
                                showToast('Custom client imported successfully!', 'success');
                                loadInstances();
                            }
                            else if (res.error) showToast(res.error, 'error');
                        } finally {
                            setProcessing(null);
                        }
                    }}>
                        Import Custom Client
                    </button>
                    <button className={styles.createBtn} onClick={() => setShowCreateModal(true)}>
                        <Plus size={18} />
                        New Profile
                    </button>
                </div>
            </div>

            <div className={styles.grid}>
                {loading ? (
                    // Skeleton Grid
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className={styles.instanceCard} style={{ cursor: 'default' }}>
                            <div className={styles.instanceIcon}>
                                <Skeleton width="100%" height="100%" style={{ borderRadius: 12 }} />
                            </div>
                            <div className={styles.instanceInfo} style={{ width: '100%' }}>
                                <Skeleton width="70%" height={16} style={{ marginBottom: 6 }} />
                                <Skeleton width="40%" height={12} />
                            </div>
                        </div>
                    ))
                ) : instances.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}><FolderOpen size={64} color="#666" /></div>
                        <h3>No profiles found</h3>
                        <p>Create a new profile or import one to start playing.</p>
                        <button className={styles.createBtnBig} onClick={() => setShowCreateModal(true)}>
                            Create Profile
                        </button>
                    </div>
                ) : (
                    instances.map(instance => {
                        const loaderClass = styles[`loader${instance.loader.charAt(0).toUpperCase() + instance.loader.slice(1).toLowerCase()}`] || styles.loaderVanilla;

                        const formatRelativeTime = (timestamp: number) => {
                            if (!timestamp || timestamp === 0) return 'Never';
                            const diff = Date.now() - timestamp;
                            const mins = Math.floor(diff / 60000);
                            const hours = Math.floor(mins / 60);
                            const days = Math.floor(hours / 24);

                            if (days > 0) return `${days}d ago`;
                            if (hours > 0) return `${hours}h ago`;
                            if (mins > 0) return `${mins}m ago`;
                            return 'Just now';
                        };

                        return (
                            <div key={instance.id} className={styles.instanceCard} onClick={() => onSelectInstance?.(instance)}>
                                <div className={styles.instanceIcon} style={{
                                    background: (instance.iconLocal || instance.icon) ? 'transparent' : instance.isFavorite
                                        ? 'linear-gradient(135deg, #ff8800, #ff4400)'
                                        : undefined
                                }}>
                                    {(instance.iconLocal || instance.icon) ? (
                                        <img 
                                            src={instance.iconLocal || instance.icon} 
                                            alt={instance.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px' }}
                                            onError={(e) => {
                                                // Fallback to letter if image fails to load
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).parentElement!.innerText = instance.name.charAt(0).toUpperCase();
                                            }}
                                        />
                                    ) : (
                                        instance.name.charAt(0).toUpperCase()
                                    )}
                                </div>
                                <div className={styles.instanceInfo}>
                                    <div className={styles.instanceName}>{instance.name}</div>
                                    <div className={styles.instanceMeta}>
                                        <span className={`${styles.loaderLabel} ${loaderClass}`}>
                                            {instance.loader || 'Vanilla'}
                                        </span>
                                        <span>{instance.version}</span>
                                    </div>
                                    <div className={styles.timeInfo}>
                                        <Clock size={12} />
                                        <span>{formatRelativeTime(instance.lastPlayed)}</span>
                                    </div>
                                </div>

                                <button
                                    className={`${styles.favoriteBtn} ${instance.isFavorite ? styles.favoriteActive : ''}`}
                                    onClick={(e) => handleToggleFavorite(e, instance)}
                                    title={instance.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
                                    style={{
                                        position: 'absolute',
                                        top: 12,
                                        right: 12,
                                        background: 'rgba(0,0,0,0.5)',
                                        border: 'none',
                                        borderRadius: '6px',
                                        padding: '6px',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s',
                                        zIndex: 2
                                    }}
                                >
                                    <Star size={16} fill={instance.isFavorite ? '#ffaa00' : 'none'} color={instance.isFavorite ? '#ffaa00' : '#666'} />
                                </button>

                                <div className={styles.playOverlay}>
                                    <div style={{ marginRight: 'auto', display: 'flex', gap: 8 }}>
                                        <button
                                            className={styles.libBtn}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onNavigate?.('library', instance.id);
                                            }}
                                            title="Open Library"
                                        >
                                            <Library size={20} />
                                        </button>
                                    </div>
                                    <button
                                        className={styles.settingsBtn}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSettingsInstance(instance);
                                        }}
                                        title="Settings"
                                    >
                                        <Settings size={20} />
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>

            {showCreateModal && (
                <CreateInstanceModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={handleCreated}
                />
            )}

            {settingsInstance && (
                <InstanceSettingsModal
                    instance={settingsInstance}
                    onClose={() => setSettingsInstance(null)}
                    onUpdate={async () => {
                        await loadInstances();
                        // Update settingsInstance with fresh data from the list
                        const updatedInstance = instances.find(i => i.id === settingsInstance.id);
                        if (updatedInstance) {
                            setSettingsInstance(updatedInstance);
                        }
                    }}
                    onProcessing={(msg, sub) => setProcessing({ message: msg, subMessage: sub })}
                    onProcessingEnd={() => setProcessing(null)}
                />
            )}

            {processing && (
                <ProcessingModal
                    message={processing.message}
                    subMessage={processing.subMessage}
                    progress={processing.progress}
                />
            )}
        </div>
    );
};
