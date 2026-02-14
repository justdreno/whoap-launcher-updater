import React, { useState, useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import styles from './InstanceMods.module.css';
import { ChevronLeft, Trash2, Plus, Package, Power, Lock, Search } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';
import { ContentBrowser } from '../components/ContentBrowser';

interface InstanceModsProps {
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

export const InstanceMods: React.FC<InstanceModsProps> = ({ instanceId, onBack, hideBackButton, hideHeader }) => {
    const [installedItems, setInstalledItems] = useState<InstalledItem[]>([]);
    const [installedSearchQuery, setInstalledSearchQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [showBrowser, setShowBrowser] = useState(false);

    const { showToast } = useToast();
    const confirm = useConfirm();
    const [instanceMeta, setInstanceMeta] = useState<{ version: string, loader: string, isImported: boolean, isValidVersion: boolean } | null>(null);

    const config = {
        title: 'Mods',
        addLabel: 'Add Mods',
        ipcPrefix: 'mods'
    };

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
                let loader: string = inst.loader;
                if (loader === 'vanilla' || !loader) {
                    const v = inst.version.toLowerCase();
                    if (v.includes('neoforge')) loader = 'neoforge';
                    else if (v.includes('forge')) loader = 'forge';
                    else if (v.includes('quilt')) loader = 'quilt';
                    else if (v.includes('fabric')) loader = 'fabric';
                    else loader = 'fabric';
                }
                setInstanceMeta({
                    version: inst.version,
                    loader: loader,
                    isImported: inst.isImported || inst.type === 'imported' || false,
                    isValidVersion: /\d+(\.\d+)+/.test(inst.version)
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

    const handleAddItems = () => {
        setShowBrowser(true);
    };

    const handleImportLocal = async () => {
        try {
            const res = await window.ipcRenderer.invoke(`${config.ipcPrefix}:add`, instanceId);
            if (res.success) {
                showToast(`Mods imported successfully`, "success");
                loadInstalledItems();
            } else if (res.error) {
                showToast(`Failed to import: ${res.error}`, "error");
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
            console.error(`Failed to toggle mod`, e);
            setInstalledItems(prev => prev.map(m =>
                m.name === item.name ? { ...m, isEnabled: !m.isEnabled } : m
            ));
            showToast(`Failed to toggle mod`, "error");
        }
    };

    const handleDelete = async (item: InstalledItem) => {
        const shouldDelete = await confirm(
            `Delete Mod?`,
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
                showToast(`Failed to delete mod`, "error");
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
                        <h1 className={styles.pageTitle}>Manage Content</h1>
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
                    placeholder={`Filter installed mods...`}
                    value={installedSearchQuery}
                    onChange={(e) => setInstalledSearchQuery(e.target.value)}
                />
                {(instanceMeta?.isImported || !instanceMeta?.isValidVersion) ? (
                    <button className={`${styles.addModBtn} ${styles.lockedBtn}`} disabled title={instanceMeta?.isImported ? "Not available for imported instances" : "Invalid Minecraft version"}>
                        <Lock size={18} />
                        <span>Locked</span>
                    </button>
                ) : (
                    <div className={styles.actionButtons}>
                        <button className={styles.addModBtn} onClick={handleAddItems} title="Browse Mods">
                            <Search size={18} />
                            <span>Browse</span>
                        </button>
                        <button className={`${styles.addModBtn} ${styles.secondaryAdd}`} onClick={handleImportLocal} title="Import Local Mod">
                            <Plus size={20} />
                            <span>Local</span>
                        </button>
                    </div>
                )}
            </div>

            <div className={styles.content}>
                {loading ? (
                    <div className={styles.loading}>
                        <Skeleton width="100%" height={60} />
                        <div style={{ height: 12 }} />
                        <Skeleton width="100%" height={60} />
                    </div>
                ) : (
                    <div className={styles.modList}>
                        {installedItems.length === 0 && <div style={{ color: '#888', padding: 20 }}>No mods installed.</div>}
                        {installedItems.filter(m => m.name.toLowerCase().includes(installedSearchQuery.toLowerCase())).map(item => (
                            <div key={item.name} className={`${styles.modCard} ${!item.isEnabled ? styles.disabled : ''}`}>
                                <div className={styles.modIconWrapper}>
                                    <Package size={24} />
                                </div>
                                <div className={styles.modDetails}>
                                    <div className={styles.modName}>
                                        {item.name.replace('.jar', '').replace('.disabled', '')}
                                    </div>
                                    <div className={styles.modMeta}>
                                        <span className={`${styles.statusPill} ${item.isEnabled ? styles.enabled : ''}`}>
                                            {item.isEnabled ? 'Enabled' : 'Disabled'}
                                        </span>
                                        <span className={styles.modSize}>{(item.size / 1024).toFixed(1)} KB</span>
                                    </div>
                                </div>
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
                        ))}
                    </div>
                )}
            </div>
            {showBrowser && instanceMeta && (
                <ContentBrowser
                    instanceId={instanceId}
                    version={instanceMeta.version}
                    loader={instanceMeta.loader}
                    type="mod"
                    onClose={() => {
                        setShowBrowser(false);
                        loadInstalledItems();
                    }}
                />
            )}
        </div>
    );
};
