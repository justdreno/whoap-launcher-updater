import React, { useState, useEffect } from 'react';
import { 
    X, 
    Edit3, 
    Copy, 
    Download, 
    FolderOpen, 
    Trash2, 
    Image,
    Star,
    Box,
    AlertTriangle,
    ChevronRight,
    Coffee,
    Check
} from 'lucide-react';
import styles from './InstanceSettingsModal.module.css';
import { Instance, InstanceApi } from '../api/instances';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';

interface InstanceSettingsModalProps {
    instance: Instance;
    onClose: () => void;
    onUpdate: () => void;
    onProcessing?: (message: string, subMessage?: string) => void;
    onProcessingEnd?: () => void;
}

export const InstanceSettingsModal: React.FC<InstanceSettingsModalProps> = ({
    instance, onClose, onUpdate, onProcessing, onProcessingEnd
}) => {
    const confirm = useConfirm();
    const [deleting, setDeleting] = useState(false);
    const { showToast } = useToast();

    const [activeTab, setActiveTab] = useState<'general' | 'icon' | 'java' | 'danger'>('general');
    const [isRenaming, setIsRenaming] = useState(false);
    const [isDuplicating, setIsDuplicating] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [iconUrl, setIconUrl] = useState(instance.icon || '');
    
    // Java management state
    const [systemJava, setSystemJava] = useState<{ version: string; path: string }[]>([]);
    const [selectedJava, setSelectedJava] = useState<string | null>(instance.javaPath || null);

    // Load system Java installations
    useEffect(() => {
        const loadJava = async () => {
            const javaList = await InstanceApi.scanSystemJava();
            setSystemJava(javaList);
        };
        if (activeTab === 'java') {
            loadJava();
        }
    }, [activeTab]);

    const canRename = instance.type === 'created';
    
    const handleJavaSelect = async (javaPath: string | null) => {
        const result = await InstanceApi.updateJavaPath(instance.id, javaPath);
        if (result.success) {
            setSelectedJava(javaPath);
            onUpdate();
            showToast(javaPath ? 'Custom Java set' : 'Using default Java', 'success');
        } else {
            showToast('Failed to update Java path', 'error');
        }
    };

    const handleToggleFavorite = async () => {
        await InstanceApi.toggleFavorite(instance.id);
        onUpdate();
        showToast(instance.isFavorite ? 'Removed from favorites' : 'Added to favorites', 'success');
    };

    const startRename = () => {
        if (!canRename) return;
        setInputValue(instance.name);
        setIsRenaming(true);
    };

    const startDuplicate = () => {
        setInputValue(`${instance.name} Copy`);
        setIsDuplicating(true);
    };

    const handleRenameSubmit = async () => {
        if (!inputValue.trim()) return;
        try {
            const result = await InstanceApi.rename(instance.id, inputValue.trim());
            if (result.success) {
                onUpdate();
                setIsRenaming(false);
                showToast('Profile renamed!', 'success');
            } else {
                showToast(`Failed to rename: ${result.error}`, 'error');
            }
        } catch (e) {
            showToast("Failed to rename profile", 'error');
        }
    };

    const handleDuplicateSubmit = async () => {
        if (!inputValue.trim()) return;
        onProcessing?.('Duplicating Profile...', 'Copying files and configuring...');
        try {
            const result = await InstanceApi.duplicate(instance.id, inputValue.trim());
            if (result.success) {
                onUpdate();
                setIsDuplicating(false);
                showToast('Profile duplicated!', 'success');
            } else {
                showToast(`Failed to duplicate: ${result.error}`, 'error');
            }
        } catch (e) {
            showToast("Failed to duplicate profile", 'error');
        } finally {
            onProcessingEnd?.();
        }
    };

    const handleExport = async () => {
        onProcessing?.('Exporting Profile...', 'Creating .zip archive...');
        try {
            const res = await InstanceApi.export(instance.id);
            if (res.error) showToast(res.error, 'error');
            else if (res.success) showToast(`Exported to: ${res.filePath}`, 'success');
        } catch (e) {
            showToast("Export failed", 'error');
        } finally {
            onProcessingEnd?.();
        }
    };

    const handleOpenFolder = async () => {
        await InstanceApi.openFolder(instance.id);
    };

    const handleDelete = async () => {
        const shouldDelete = await confirm(
            'Delete Profile?',
            `Are you sure you want to delete "${instance.name}"? This action cannot be undone.`,
            { confirmLabel: 'Delete', isDanger: true }
        );

        if (shouldDelete) {
            setDeleting(true);
            try {
                await InstanceApi.delete(instance.id);
                showToast('Profile deleted.', 'success');
                onUpdate();
                onClose();
            } catch (e) {
                showToast("Failed to delete profile", 'error');
            } finally {
                setDeleting(false);
            }
        }
    };

    const handleUpdateIcon = async () => {
        try {
            const result = await InstanceApi.updateIcon(instance.id, iconUrl || null);
            if (result.success) {
                showToast('Icon updated!', 'success');
                onUpdate();
            } else {
                showToast(result.error || 'Failed to update icon', 'error');
            }
        } catch (e) {
            showToast('Failed to update icon', 'error');
        }
    };

    const formatPlayTime = (seconds?: number) => {
        if (!seconds || seconds === 0) return '0h 0m';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    };

    const getLoaderColor = (loader: string) => {
        switch (loader?.toLowerCase()) {
            case 'fabric': return '#38bdf8';
            case 'forge': return '#fb923c';
            case 'quilt': return '#a78bfa';
            case 'neoforge': return '#f87171';
            default: return '#888';
        }
    };

    if (isRenaming) {
        return (
            <div className={styles.overlay} onClick={onClose}>
                <div className={styles.modal} onClick={e => e.stopPropagation()}>
                    <div className={styles.header}>
                        <div className={styles.headerIcon}><Edit3 size={18} /></div>
                        <h2>Rename Profile</h2>
                        <button className={styles.closeBtn} onClick={() => setIsRenaming(false)}><X size={18} /></button>
                    </div>
                    <div className={styles.content}>
                        <div className={styles.formGroup}>
                            <label>Profile Name</label>
                            <input
                                type="text"
                                className={styles.input}
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleRenameSubmit()}
                                placeholder="Enter new name..."
                            />
                        </div>
                    </div>
                    <div className={styles.footer}>
                        <button className={styles.cancelBtn} onClick={() => setIsRenaming(false)}>Cancel</button>
                        <button className={styles.saveBtn} onClick={handleRenameSubmit}>Save</button>
                    </div>
                </div>
            </div>
        );
    }

    if (isDuplicating) {
        return (
            <div className={styles.overlay} onClick={onClose}>
                <div className={styles.modal} onClick={e => e.stopPropagation()}>
                    <div className={styles.header}>
                        <div className={styles.headerIcon}><Copy size={18} /></div>
                        <h2>Duplicate Profile</h2>
                        <button className={styles.closeBtn} onClick={() => setIsDuplicating(false)}><X size={18} /></button>
                    </div>
                    <div className={styles.content}>
                        <div className={styles.formGroup}>
                            <label>New Profile Name</label>
                            <input
                                type="text"
                                className={styles.input}
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                autoFocus
                                onKeyDown={e => e.key === 'Enter' && handleDuplicateSubmit()}
                                placeholder="Enter name for copy..."
                            />
                        </div>
                    </div>
                    <div className={styles.footer}>
                        <button className={styles.cancelBtn} onClick={() => setIsDuplicating(false)}>Cancel</button>
                        <button className={styles.saveBtn} onClick={handleDuplicateSubmit}>Duplicate</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerIcon}>
                        {instance.icon ? (
                            <img src={instance.icon} alt="" className={styles.headerIconImg} />
                        ) : (
                            <Box size={18} />
                        )}
                    </div>
                    <div className={styles.headerInfo}>
                        <h2>{instance.name}</h2>
                        <div className={styles.headerMeta}>
                            <span className={styles.badge}>{instance.version}</span>
                            <span className={styles.badge} style={{ color: getLoaderColor(instance.loader) }}>
                                {instance.loader}
                            </span>
                            <span className={styles.playTime}>{formatPlayTime(instance.playTime)} played</span>
                        </div>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}><X size={18} /></button>
                </div>

                {/* Tabs */}
                <div className={styles.tabs}>
                    <button 
                        className={`${styles.tab} ${activeTab === 'general' ? styles.active : ''}`}
                        onClick={() => setActiveTab('general')}
                    >
                        General
                    </button>
                    <button 
                        className={`${styles.tab} ${activeTab === 'icon' ? styles.active : ''}`}
                        onClick={() => setActiveTab('icon')}
                    >
                        Icon
                    </button>
                    <button 
                        className={`${styles.tab} ${activeTab === 'java' ? styles.active : ''}`}
                        onClick={() => setActiveTab('java')}
                    >
                        Java
                    </button>
                    <button 
                        className={`${styles.tab} ${activeTab === 'danger' ? styles.danger : ''} ${activeTab === 'danger' ? styles.active : ''}`}
                        onClick={() => setActiveTab('danger')}
                    >
                        Danger
                    </button>
                </div>

                {/* Content */}
                <div className={styles.content}>
                    {activeTab === 'general' && (
                        <div className={styles.panel}>
                            {/* Favorite Action */}
                            <div className={styles.actionCard} onClick={handleToggleFavorite}>
                                <div className={styles.actionIcon} style={{ 
                                    background: instance.isFavorite ? 'rgba(255, 170, 0, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                                    color: instance.isFavorite ? '#ffaa00' : '#666'
                                }}>
                                    <Star size={20} fill={instance.isFavorite ? '#ffaa00' : 'none'} />
                                </div>
                                <div className={styles.actionInfo}>
                                    <div className={styles.actionTitle}>
                                        {instance.isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                                    </div>
                                    <div className={styles.actionDesc}>
                                        {instance.isFavorite 
                                            ? 'This profile is in your favorites' 
                                            : 'Add this profile to your favorites list'}
                                    </div>
                                </div>
                                <ChevronRight size={18} className={styles.actionArrow} />
                            </div>

                            {/* Actions Grid */}
                            <div className={styles.sectionTitle}>Actions</div>
                            <div className={styles.actionsGrid}>
                                <button 
                                    className={`${styles.actionBtn} ${!canRename ? styles.disabled : ''}`}
                                    onClick={startRename}
                                    title={canRename ? "Rename Profile" : "Cannot rename external profile"}
                                >
                                    <div className={styles.actionBtnIcon}><Edit3 size={18} /></div>
                                    <span>Rename</span>
                                </button>
                                <button className={styles.actionBtn} onClick={startDuplicate}>
                                    <div className={styles.actionBtnIcon}><Copy size={18} /></div>
                                    <span>Duplicate</span>
                                </button>
                                <button className={styles.actionBtn} onClick={handleExport}>
                                    <div className={styles.actionBtnIcon}><Download size={18} /></div>
                                    <span>Export</span>
                                </button>
                                <button className={styles.actionBtn} onClick={handleOpenFolder}>
                                    <div className={styles.actionBtnIcon}><FolderOpen size={18} /></div>
                                    <span>Open Folder</span>
                                </button>
                            </div>
                        </div>
                    )}

                    {activeTab === 'icon' && (
                        <div className={styles.panel}>
                            <div className={styles.sectionTitle}>Custom Icon</div>
                            <div className={styles.iconSection}>
                                <div className={styles.iconPreview}>
                                    {instance.icon ? (
                                        <img src={instance.icon} alt="Current icon" />
                                    ) : (
                                        <div className={styles.iconPlaceholder}>
                                            {instance.name.charAt(0).toUpperCase()}
                                        </div>
                                    )}
                                </div>
                                <div className={styles.iconInputGroup}>
                                    <input
                                        type="text"
                                        className={styles.input}
                                        value={iconUrl}
                                        onChange={e => setIconUrl(e.target.value)}
                                        placeholder="Enter image URL..."
                                    />
                                    <button className={styles.iconBtn} onClick={handleUpdateIcon}>
                                        <Image size={16} />
                                        Set Icon
                                    </button>
                                </div>
                                {instance.icon && (
                                    <button 
                                        className={styles.removeIconBtn}
                                        onClick={() => { setIconUrl(''); handleUpdateIcon(); }}
                                    >
                                        Remove Icon
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'java' && (
                        <div className={styles.panel}>
                            <div className={styles.sectionTitle}>Java Runtime</div>
                            
                            {/* Current Java Info */}
                            <div className={styles.javaInfoCard}>
                                <div className={styles.javaInfoHeader}>
                                    <Coffee size={20} />
                                    <span>Current Java</span>
                                </div>
                                <div className={styles.javaInfoContent}>
                                    {selectedJava ? (
                                        <>
                                            <div className={styles.javaPath}>{selectedJava}</div>
                                            <button 
                                                className={styles.clearJavaBtn}
                                                onClick={() => handleJavaSelect(null)}
                                            >
                                                Use Default
                                            </button>
                                        </>
                                    ) : (
                                        <div className={styles.javaDefault}>Using automatic Java detection</div>
                                    )}
                                </div>
                            </div>

                            {/* System Java List */}
                            <div className={styles.sectionTitle}>Available Java Installations</div>
                            {systemJava.length === 0 ? (
                                <div className={styles.javaEmpty}>Scanning for Java installations...</div>
                            ) : (
                                <div className={styles.javaList}>
                                    {systemJava.map((java, idx) => (
                                        <div 
                                            key={idx}
                                            className={`${styles.javaItem} ${selectedJava === java.path ? styles.selected : ''}`}
                                            onClick={() => handleJavaSelect(java.path)}
                                        >
                                            <div className={styles.javaVersion}>Java {java.version}</div>
                                            <div className={styles.javaPath}>{java.path}</div>
                                            {selectedJava === java.path && <Check size={16} />}
                                        </div>
                                    ))}
                                </div>
                            )}
                            
                            <div className={styles.javaNote}>
                                Select a specific Java version to use for this profile, or leave as default for automatic detection.
                            </div>
                        </div>
                    )}

                    {activeTab === 'danger' && (
                        <div className={styles.panel}>
                            <div className={styles.dangerHeader}>
                                <AlertTriangle size={20} />
                                <span>Danger Zone</span>
                            </div>
                            <div className={styles.dangerCard}>
                                <div className={styles.dangerInfo}>
                                    <div className={styles.dangerTitle}>Delete Profile</div>
                                    <div className={styles.dangerDesc}>
                                        Permanently delete "{instance.name}" and all its data. This action cannot be undone.
                                    </div>
                                </div>
                                <button 
                                    className={styles.deleteBtn} 
                                    onClick={handleDelete} 
                                    disabled={deleting}
                                >
                                    <Trash2 size={16} />
                                    {deleting ? 'Deleting...' : 'Delete'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
