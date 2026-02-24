import React, { useState, useEffect } from 'react'; // Re-trigger index
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import styles from './InstanceMods.module.css'; // Re-use styles
import { ChevronLeft, Trash2, Plus, Package, Power, Search } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';
import { ContentBrowser } from '../components/ContentBrowser';

interface InstanceResourcePacksProps {
    instanceId: string;
    onBack: () => void;
    hideBackButton?: boolean;
    hideHeader?: boolean;
}

interface InstalledItem {
    name: string;
    path: string;
    size: number;
    isEnabled: boolean;
}

export const InstanceResourcePacks: React.FC<InstanceResourcePacksProps> = ({ instanceId, onBack, hideBackButton, hideHeader }) => {
    const [installedItems, setInstalledItems] = useState<InstalledItem[]>([]);
    const [installedSearchQuery, setInstalledSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);

    const { showToast } = useToast();
    const confirm = useConfirm();
    const [instanceMeta, setInstanceMeta] = useState<{ version: string, loader: string } | null>(null);

    const config = {
        title: 'Resource Packs',
        addLabel: 'Add Pack',
        ipcPrefix: 'resourcepacks'
    };

    const [showBrowser, setShowBrowser] = useState(false);

    // Initial Load
    useEffect(() => {
        loadInstanceDetails();
    }, [instanceId]);

    useEffect(() => {
        loadInstalledItems();
    }, [instanceId]);

    const loadInstanceDetails = async () => {
        try {
            const { InstanceApi } = await import('../api/instances');
            const list = await InstanceApi.list();
            const inst = list.find(i => i.id === instanceId);
            if (inst) {
                setInstanceMeta({
                    version: inst.version,
                    loader: inst.loader || 'Vanilla'
                });
            }
        } catch (e) {
            console.error("Failed to load instance meta", e);
        }
    };

    const loadInstalledItems = async () => {
        setLoading(true);
        try {
            const list = await window.ipcRenderer.invoke(`${config.ipcPrefix}:list`, instanceId);
            setInstalledItems(list);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleAddItems = async () => {
        try {
            const res = await window.ipcRenderer.invoke(`${config.ipcPrefix}:add`, instanceId);
            if (res.success) {
                showToast(`Resource packs added`, "success");
                loadInstalledItems();
            } else if (res.error) {
                showToast(`Failed to add: ${res.error}`, "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Failed to open file dialog", "error");
        }
    };

    const handleToggle = async (item: InstalledItem) => {
        setInstalledItems(prev => prev.map(m =>
            m.name === item.name ? { ...m, isEnabled: !m.isEnabled } : m
        ));

        try {
            await window.ipcRenderer.invoke(`${config.ipcPrefix}:toggle`, instanceId, item.name);
        } catch (e) {
            console.error(`Failed to toggle pack`, e);
            setInstalledItems(prev => prev.map(m =>
                m.name === item.name ? { ...m, isEnabled: !m.isEnabled } : m
            ));
            showToast(`Failed to toggle pack`, "error");
        }
    };

    const handleDelete = async (item: InstalledItem) => {
        const shouldDelete = await confirm(
            `Delete Pack?`,
            `Delete ${item.name}?`,
            { confirmLabel: 'Delete', isDanger: true }
        );
        if (shouldDelete) {
            setInstalledItems(prev => prev.filter(m => m.name !== item.name));
            try {
                await window.ipcRenderer.invoke(`${config.ipcPrefix}:delete`, instanceId, item.name);
                showToast(`Deleted ${item.name}`, "success");
            } catch (e) {
                console.error(e);
                showToast(`Failed to delete pack`, "error");
                loadInstalledItems();
            }
        }
    };

    return (
        <div className={styles.container}>
            {!hideHeader && (
                <div className={styles.header}>
                    {!hideBackButton && (
                        <button className={styles.backBtn} onClick={onBack} title="Back">
                            <ChevronLeft size={24} />
                        </button>
                    )}
                    <div className={styles.titleArea}>
                        <h1 className={styles.pageTitle}>{config.title}</h1>
                        {instanceMeta && (
                            <div className={styles.instanceBadge}>
                                <span>Minecraft {instanceMeta.version}</span>
                                <div className={styles.loaderTag}>{instanceMeta.loader}</div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div className={styles.searchArea}>
                <input
                    className={styles.searchInput}
                    placeholder={`Filter installed packs...`}
                    value={installedSearchQuery}
                    onChange={(e) => setInstalledSearchQuery(e.target.value)}
                />

                <div className={styles.actionButtons}>
                    <button className={styles.addModBtn} onClick={() => setShowBrowser(true)} title="Browse Online">
                        <Search size={18} />
                        <span>Browse</span>
                    </button>
                    <button className={`${styles.addModBtn} ${styles.secondaryAdd}`} onClick={handleAddItems} title="Add Local Pack">
                        <Plus size={20} />
                        <span>Local</span>
                    </button>
                </div>
            </div>

            <div className={styles.content}>
                {loading ? (
                    <div className={styles.loading}>
                        <Skeleton width="100%" height={60} />
                        <div style={{ height: 12 }} />
                        <Skeleton width="100%" height={60} />
                    </div>
                ) : (
                    <div className={styles.modGrid}>
                        {installedItems.length === 0 && <div style={{ color: '#888', padding: 20 }}>No packs installed.</div>}
                        {installedItems.filter(m => m.name.toLowerCase().includes(installedSearchQuery.toLowerCase())).map(item => (
                            <div key={item.name} className={`${styles.modCard} ${!item.isEnabled ? styles.disabled : ''}`}>
                                <div className={styles.modCardTop}>
                                    <div className={styles.modIconWrapper}>
                                        <Package size={24} />
                                    </div>
                                    <div className={styles.modDetails}>
                                        <div className={styles.modName} title={item.name.replace('.zip', '').replace('.disabled', '')}>
                                            {item.name.replace('.zip', '').replace('.disabled', '')}
                                        </div>
                                        <div className={styles.modMeta}>
                                            <span className={`${styles.statusPill} ${item.isEnabled ? styles.enabled : ''}`}>
                                                {item.isEnabled ? 'Enabled' : 'Disabled'}
                                            </span>
                                            <span className={styles.modSize}>{(item.size / 1024).toFixed(1)} KB</span>
                                        </div>
                                    </div>
                                </div>
                                <div className={styles.modCardBottom}>
                                    <div className={styles.modActions}>
                                        <button
                                            className={`${styles.actionBtn} ${item.isEnabled ? styles.enabledAction : ''}`}
                                            onClick={() => handleToggle(item)}
                                            title={item.isEnabled ? "Disable" : "Enable"}
                                        >
                                            <Power size={16} />
                                        </button>
                                        <button
                                            className={`${styles.actionBtn} ${styles.dangerBtn}`}
                                            onClick={() => handleDelete(item)}
                                            title="Delete"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            {showBrowser && instanceMeta && (
                <ContentBrowser
                    instanceId={instanceId}
                    version={instanceMeta.version}
                    loader={instanceMeta.loader}
                    type="resourcepack"
                    onClose={() => {
                        setShowBrowser(false);
                        loadInstalledItems();
                    }}
                />
            )}
        </div>
    );
};
