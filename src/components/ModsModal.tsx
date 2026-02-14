import React, { useState, useEffect } from 'react';
import styles from './ModsModal.module.css';
import { X, Package, Trash2, Plus, RefreshCw, Search } from 'lucide-react';

interface Mod {
    name: string;
    path: string;
    size: number;
    isEnabled: boolean;
}

interface ModsModalProps {
    instanceId: string;
    instanceName: string;
    onClose: () => void;
}

export const ModsModal: React.FC<ModsModalProps> = ({ instanceId, instanceName, onClose }) => {
    const [mods, setMods] = useState<Mod[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(true);

    const loadMods = async () => {
        setLoading(true);
        try {
            const list = await window.ipcRenderer.invoke('mods:list', instanceId);
            setMods(list);
        } catch (error) {
            console.error("Failed to load mods", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadMods();
    }, [instanceId]);

    const handleToggle = async (mod: Mod) => {
        try {
            // Optimistic update
            const newStatus = !mod.isEnabled;
            setMods(mods.map(m => m.name === mod.name ? { ...m, isEnabled: newStatus } : m));

            await window.ipcRenderer.invoke('mods:toggle', instanceId, mod.name);
            loadMods(); // Refresh to ensure correct extensions
        } catch (error) {
            console.error("Failed to toggle mod", error);
            loadMods(); // Revert on error
        }
    };

    const handleDelete = async (mod: Mod) => {
        if (!confirm(`Delete ${mod.name}?`)) return;
        try {
            await window.ipcRenderer.invoke('mods:delete', instanceId, mod.name);
            setMods(mods.filter(m => m.name !== mod.name));
        } catch (error) {
            console.error("Failed to delete mod", error);
        }
    };

    const handleAdd = async () => {
        try {
            const result = await window.ipcRenderer.invoke('mods:add', instanceId);
            if (result.success) {
                loadMods();
            }
        } catch (error) {
            console.error("Failed to add mods", error);
        }
    };

    const formatSize = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const filteredMods = mods.filter(m => m.name.toLowerCase().includes(searchTerm.toLowerCase()));

    return (
        <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <div className={styles.title}>
                        <Package size={20} color="#ff8800" style={{ flexShrink: 0 }} />
                        <span className={styles.titleText}>Mods Manager - {instanceName}</span>
                    </div>
                    <div style={{ flex: 1, margin: '0 20px', position: 'relative', minWidth: '200px' }}>
                        <Search size={14} color="#666" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Search mods..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                width: '100%',
                                background: '#141414',
                                border: '1px solid #333',
                                borderRadius: '8px',
                                padding: '8px 10px 8px 32px',
                                color: '#fff',
                                fontSize: '12px',
                                outline: 'none'
                            }}
                        />
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.content}>
                    {loading ? (
                        <div className={styles.emptyState}>Loading mods...</div>
                    ) : filteredMods.length === 0 ? (
                        <div className={styles.emptyState}>
                            <Package size={48} />
                            <div>{searchTerm ? 'No matching mods found' : 'No mods installed'}</div>
                        </div>
                    ) : (
                        <div className={styles.modList}>
                            {filteredMods.map(mod => (
                                <div key={mod.name} className={styles.modItem}>
                                    <div className={styles.modIcon}>
                                        <Package size={18} opacity={mod.isEnabled ? 1 : 0.5} />
                                    </div>
                                    <div className={styles.modInfo}>
                                        <div className={`${styles.modName} ${!mod.isEnabled ? styles.disabled : ''}`}>
                                            {mod.name.replace('.disabled', '')}
                                        </div>
                                        <div className={styles.modSize}>
                                            {formatSize(mod.size)} • {mod.isEnabled ? 'Enabled' : 'Disabled'}
                                        </div>
                                    </div>
                                    <div className={styles.actions}>
                                        <label className={styles.toggleSwitch}>
                                            <input
                                                type="checkbox"
                                                className={styles.toggleInput}
                                                checked={mod.isEnabled}
                                                onChange={() => handleToggle(mod)}
                                            />
                                            <span className={styles.toggleSlider}></span>
                                        </label>
                                        <button className={styles.deleteBtn} onClick={() => handleDelete(mod)} title="Delete mod">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div className={styles.footer}>
                    <button className={styles.refreshBtn} onClick={loadMods} title="Refresh List">
                        <RefreshCw size={18} />
                    </button>
                    <button className={styles.addBtn} onClick={handleAdd}>
                        <Plus size={18} /> Add Mods
                    </button>
                </div>
            </div>
        </div>
    );
};
