import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';
import { 
    Globe, 
    Download, 
    Upload, 
    Trash2, 
    FolderOpen, 
    RefreshCw,
    Archive,
    Grid,
    List,
    User,
    SortDesc,
    Box,
    Map,
    Search,
    X
} from 'lucide-react';
import { Instance, InstanceApi } from '../api/instances';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { CustomSelect } from '../components/CustomSelect';
import styles from './WorldManagement.module.css';

interface World {
    id: string;
    name: string;
    instanceId: string;
    instanceName: string;
    size: number;
    lastPlayed: number;
    gameMode: string;
    icon?: string;
}

interface Backup {
    id: string;
    worldName: string;
    instanceId: string;
    instanceName: string;
    createdAt: number;
    size: number;
    path: string;
}

export const WorldManagement: React.FC = () => {
    const [worlds, setWorlds] = useState<World[]>([]);
    const [backups, setBackups] = useState<Backup[]>([]);
    const [instances, setInstances] = useState<Instance[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [activeTab, setActiveTab] = useState<'worlds' | 'backups'>('worlds');
    const [selectedInstance, setSelectedInstance] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
    const [searchQuery, setSearchQuery] = useState('');
    const [processing, setProcessing] = useState<{ message: string; progress?: number } | null>(null);
    
    const { showToast } = useToast();
    const confirm = useConfirm();

    const loadData = async () => {
        setLoading(true);
        try {
            const instanceList = await InstanceApi.list();
            setInstances(instanceList);

            const worldsData: World[] = [];
            for (const instance of instanceList) {
                try {
                    const instanceWorlds = await window.ipcRenderer.invoke('worlds:list', instance.id);
                    if (instanceWorlds && Array.isArray(instanceWorlds)) {
                        worldsData.push(...instanceWorlds.map((w: any) => ({
                            ...w,
                            instanceId: instance.id,
                            instanceName: instance.name
                        })));
                    }
                } catch (e) {
                    console.error(`Failed to load worlds for instance ${instance.id}:`, e);
                }
            }
            setWorlds(worldsData);

            const backupsData = await window.ipcRenderer.invoke('worlds:list-backups');
            setBackups(backupsData || []);
        } catch (error) {
            console.error('Failed to load world data:', error);
            showToast('Failed to load world data', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const filteredWorlds = React.useMemo(() => {
        let filtered = activeTab === 'worlds' ? worlds : backups.map(b => ({
            id: b.id,
            name: b.worldName,
            instanceId: b.instanceId,
            instanceName: b.instanceName,
            size: b.size,
            lastPlayed: b.createdAt,
            gameMode: 'Backup'
        } as World));

        if (selectedInstance !== 'all') {
            filtered = filtered.filter(w => w.instanceId === selectedInstance);
        }

        if (searchQuery.trim()) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(w => 
                w.name.toLowerCase().includes(query) || 
                w.instanceName.toLowerCase().includes(query)
            );
        }

        switch (sortBy) {
            case 'newest':
                filtered.sort((a, b) => b.lastPlayed - a.lastPlayed);
                break;
            case 'oldest':
                filtered.sort((a, b) => a.lastPlayed - b.lastPlayed);
                break;
            case 'name':
                filtered.sort((a, b) => a.name.localeCompare(b.name));
                break;
        }

        return filtered;
    }, [worlds, backups, activeTab, selectedInstance, sortBy, searchQuery]);

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleDateString();
    };

    const handleBackup = async (world: World, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setProcessing({ message: `Backing up ${world.name}...` });
        try {
            const result = await window.ipcRenderer.invoke('worlds:backup', world.instanceId, world.id);
            if (result.success) {
                showToast(`World "${world.name}" backed up successfully!`, 'success');
                loadData();
            } else {
                showToast(result.error || 'Backup failed', 'error');
            }
        } catch (e) {
            showToast('Failed to backup world', 'error');
        } finally {
            setProcessing(null);
        }
    };

    const handleDelete = async (world: World, e?: React.MouseEvent) => {
        e?.stopPropagation();
        const confirmed = await confirm(
            'Delete World?',
            `Are you sure you want to delete "${world.name}"? This cannot be undone.`,
            { isDanger: true, confirmLabel: 'Delete' }
        );
        
        if (confirmed) {
            setProcessing({ message: `Deleting ${world.name}...` });
            try {
                const result = await window.ipcRenderer.invoke('worlds:delete', world.instanceId, world.id);
                if (result.success) {
                    showToast(`World "${world.name}" deleted`, 'success');
                    loadData();
                } else {
                    showToast(result.error || 'Delete failed', 'error');
                }
            } catch (e) {
                showToast('Failed to delete world', 'error');
            } finally {
                setProcessing(null);
            }
        }
    };

    const handleOpenFolder = async (world: World, e?: React.MouseEvent) => {
        e?.stopPropagation();
        const result = await window.ipcRenderer.invoke('worlds:open-folder', world.instanceId, world.id);
        if (!result.success) {
            showToast('Failed to open folder', 'error');
        }
    };



    const handleRestoreBackup = async (backup: Backup, e?: React.MouseEvent) => {
        e?.stopPropagation();
        const confirmed = await confirm(
            'Restore Backup?',
            `Restore "${backup.worldName}" from backup? This will overwrite the current world.`,
            { confirmLabel: 'Restore' }
        );
        
        if (confirmed) {
            setProcessing({ message: 'Restoring backup...' });
            try {
                const result = await window.ipcRenderer.invoke('worlds:restore-backup', backup.id);
                if (result.success) {
                    showToast('Backup restored successfully!', 'success');
                    loadData();
                } else {
                    showToast(result.error || 'Restore failed', 'error');
                }
            } catch (e) {
                showToast('Failed to restore backup', 'error');
            } finally {
                setProcessing(null);
            }
        }
    };

    const handleDeleteBackup = async (backup: Backup, e?: React.MouseEvent) => {
        e?.stopPropagation();
        const confirmed = await confirm(
            'Delete Backup?',
            `Delete backup of "${backup.worldName}"?`,
            { isDanger: true, confirmLabel: 'Delete' }
        );
        
        if (confirmed) {
            try {
                const result = await window.ipcRenderer.invoke('worlds:delete-backup', backup.id);
                if (result.success) {
                    showToast('Backup deleted', 'success');
                    loadData();
                } else {
                    showToast(result.error || 'Delete failed', 'error');
                }
            } catch (e) {
                showToast('Failed to delete backup', 'error');
            }
        }
    };

    const totalSize = filteredWorlds.reduce((sum, w) => sum + w.size, 0);

    return (
        <div className={styles.container}>
            <PageHeader
                title="World Management"
                description="Backup, transfer, and manage your Minecraft worlds from all profiles."
            />

            <div className={styles.stats}>
                <div className={styles.statItem}>
                    <div className={styles.statLabel}>Total Worlds</div>
                    <div className={styles.statValue}>{worlds.length}</div>
                </div>
                <div className={styles.statItem}>
                    <div className={styles.statLabel}>Backups</div>
                    <div className={styles.statValue}>{backups.length}</div>
                </div>
                <div className={styles.statItem}>
                    <div className={styles.statLabel}>Total Size</div>
                    <div className={styles.statValue}>{formatSize(totalSize)}</div>
                </div>
                <div className={styles.statItem}>
                    <div className={styles.statLabel}>Profiles</div>
                    <div className={styles.statValue}>{instances.length}</div>
                </div>
            </div>

            <div className={styles.header}>
                <div className={styles.filters}>
                    <CustomSelect
                        value={activeTab}
                        onChange={(value) => setActiveTab(value as 'worlds' | 'backups')}
                        options={[
                            { value: 'worlds', label: 'Worlds', icon: <Globe size={14} /> },
                            { value: 'backups', label: 'Backups', icon: <Archive size={14} /> }
                        ]}
                        width="140px"
                        className={styles.customFilter}
                    />

                    <CustomSelect
                        value={selectedInstance}
                        onChange={setSelectedInstance}
                        options={[
                            { value: 'all', label: 'All Profiles', icon: <User size={14} /> },
                            ...instances.map(inst => ({
                                value: inst.id,
                                label: inst.name,
                                icon: <User size={14} />
                            }))
                        ]}
                        width="180px"
                        className={styles.customFilter}
                    />

                    <CustomSelect
                        value={sortBy}
                        onChange={(value) => setSortBy(value as any)}
                        options={[
                            { value: 'newest', label: 'Newest First', icon: <SortDesc size={14} /> },
                            { value: 'oldest', label: 'Oldest First', icon: <SortDesc size={14} /> },
                            { value: 'name', label: 'Name (A-Z)', icon: <SortDesc size={14} /> }
                        ]}
                        width="160px"
                        className={styles.customFilter}
                    />

                    <div className={styles.searchWrapper}>
                        <Search size={16} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder="Search worlds..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className={styles.searchInput}
                        />
                        {searchQuery && (
                            <button 
                                className={styles.clearSearch}
                                onClick={() => setSearchQuery('')}
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                <div className={styles.viewToggle}>
                    <button
                        className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.active : ''}`}
                        onClick={() => setViewMode('grid')}
                        title="Grid View"
                    >
                        <Grid size={18} />
                    </button>
                    <button
                        className={`${styles.viewBtn} ${viewMode === 'list' ? styles.active : ''}`}
                        onClick={() => setViewMode('list')}
                        title="List View"
                    >
                        <List size={18} />
                    </button>
                </div>

                <button className={styles.refreshBtn} onClick={loadData} title="Refresh">
                    <RefreshCw size={18} />
                </button>
            </div>

            {loading ? (
                <div className={styles.loading}>Loading worlds...</div>
            ) : filteredWorlds.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <Globe size={64} />
                    </div>
                    <h3>No {activeTab} found</h3>
                    <p>{activeTab === 'worlds' ? 'Create a world in any instance to see it here.' : 'Backup your worlds to see them here.'}</p>
                </div>
            ) : viewMode === 'grid' ? (
                <div className={styles.gridView}>
                    {filteredWorlds.map((world) => (
                        <div
                            key={`${world.instanceId}-${world.id}`}
                            className={styles.worldCard}
                        >
                            <div className={styles.worldIconWrapper}>
                                <div className={styles.worldIcon}>
                                    <Box size={32} />
                                </div>
                            </div>
                            <div className={styles.cardInfo}>
                                <div className={styles.cardTitle}>{world.name}</div>
                                <div className={styles.cardSubtitle}>{world.instanceName}</div>
                                <div className={styles.cardMeta}>
                                    <span>{formatSize(world.size)}</span>
                                    <span>{formatDate(world.lastPlayed)}</span>
                                </div>
                            </div>
                            <div className={styles.cardActions}>
                                {activeTab === 'worlds' ? (
                                    <>
                                        <button 
                                            className={styles.actionBtn}
                                            onClick={(e) => handleBackup(world, e)}
                                            title="Backup"
                                        >
                                            <Download size={16} />
                                        </button>
                                        <button 
                                            className={styles.actionBtn}
                                            onClick={(e) => handleOpenFolder(world, e)}
                                            title="Open Folder"
                                        >
                                            <FolderOpen size={16} />
                                        </button>
                                        <button 
                                            className={styles.actionBtn}
                                            onClick={(e) => handleDelete(world, e)}
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button 
                                            className={styles.actionBtn}
                                            onClick={(e) => {
                                                const backup = backups.find(b => b.id === world.id);
                                                if (backup) handleRestoreBackup(backup, e);
                                            }}
                                            title="Restore"
                                        >
                                            <Upload size={16} />
                                        </button>
                                        <button 
                                            className={styles.actionBtn}
                                            onClick={(e) => {
                                                const backup = backups.find(b => b.id === world.id);
                                                if (backup) handleDeleteBackup(backup, e);
                                            }}
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className={styles.listView}>
                    {filteredWorlds.map((world) => (
                        <div
                            key={`${world.instanceId}-${world.id}`}
                            className={styles.listItem}
                        >
                            <div className={styles.listIcon}>
                                <Map size={20} />
                            </div>
                            <div className={styles.listInfo}>
                                <div className={styles.listTitle}>{world.name}</div>
                                <div className={styles.listMeta}>
                                    <span>{world.instanceName}</span>
                                    <span>{formatSize(world.size)}</span>
                                    <span>{formatDate(world.lastPlayed)}</span>
                                </div>
                            </div>
                            <div className={styles.listActions}>
                                {activeTab === 'worlds' ? (
                                    <>
                                        <button 
                                            className={styles.actionBtn}
                                            onClick={(e) => handleBackup(world, e)}
                                            title="Backup"
                                        >
                                            <Download size={16} />
                                        </button>
                                        <button 
                                            className={styles.actionBtn}
                                            onClick={(e) => handleOpenFolder(world, e)}
                                            title="Open Folder"
                                        >
                                            <FolderOpen size={16} />
                                        </button>
                                        <button 
                                            className={styles.actionBtn}
                                            onClick={(e) => handleDelete(world, e)}
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <button 
                                            className={styles.actionBtn}
                                            onClick={(e) => {
                                                const backup = backups.find(b => b.id === world.id);
                                                if (backup) handleRestoreBackup(backup, e);
                                            }}
                                            title="Restore"
                                        >
                                            <Upload size={16} />
                                        </button>
                                        <button 
                                            className={styles.actionBtn}
                                            onClick={(e) => {
                                                const backup = backups.find(b => b.id === world.id);
                                                if (backup) handleDeleteBackup(backup, e);
                                            }}
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {processing && (
                <div className={styles.processingOverlay}>
                    <div className={styles.processingContent}>
                        <RefreshCw size={32} className={styles.spin} />
                        <p>{processing.message}</p>
                    </div>
                </div>
            )}
        </div>
    );
};
