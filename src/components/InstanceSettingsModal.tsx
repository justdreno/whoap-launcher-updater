import React, { useState } from 'react';
import { X, Edit2, Copy, Archive, Folder, Trash2 } from 'lucide-react';
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

    const [actionState, setActionState] = useState<'idle' | 'renaming' | 'duplicating'>('idle');
    const [inputValue, setInputValue] = useState('');

    const canRename = instance.type === 'created';

    const startRename = () => {
        if (!canRename) return;
        setInputValue(instance.name);
        setActionState('renaming');
    };

    const startDuplicate = () => {
        setInputValue(`${instance.name} Copy`);
        setActionState('duplicating');
    };

    const handleSubmit = async () => {
        if (!inputValue.trim()) return;
        const value = inputValue.trim();

        if (actionState === 'renaming') {
            try {
                const result = await InstanceApi.rename(instance.id, value);
                if (result.success) {
                    onUpdate();
                    onClose();
                    showToast('Instance renamed!', 'success');
                } else {
                    showToast(`Failed to rename: ${result.error}`, 'error');
                }
            } catch (e) {
                console.error("Rename failed", e);
                showToast("Failed to rename instance", 'error');
            }
        } else if (actionState === 'duplicating') {
            onProcessing?.('Duplicating Instance...', 'Copying files and configuring...');
            try {
                const result = await InstanceApi.duplicate(instance.id, value);
                if (result.success) {
                    onUpdate();
                    onClose();
                    showToast('Instance duplicated!', 'success');
                } else {
                    showToast(`Failed to duplicate: ${result.error}`, 'error');
                }
            } catch (e) {
                console.error("Duplicate failed", e);
                showToast("Failed to duplicate instance", 'error');
            } finally {
                onProcessingEnd?.();
            }
        }
        setActionState('idle');
    };

    const handleExport = async () => {
        onProcessing?.('Exporting Instance...', 'Creating .zip archive...');
        try {
            const res = await InstanceApi.export(instance.id);
            if (res.error) showToast(res.error, 'error');
            else if (res.success) showToast(`Exported to: ${res.filePath}`, 'success');
        } catch (e) {
            console.error("Export failed", e);
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
            'Delete Instance?',
            `Are you sure you want to delete "${instance.name}"? This cannot be undone.`,
            { confirmLabel: 'Delete', isDanger: true }
        );

        if (shouldDelete) {
            setDeleting(true);
            try {
                await InstanceApi.delete(instance.id);
                showToast('Instance deleted.', 'success');
                onUpdate();
                onClose();
            } catch (e) {
                console.error("Delete failed", e);
                showToast("Failed to delete instance", 'error');
            } finally {
                setDeleting(false);
            }
        }
    };

    return (
        <div className={styles.modalOverlay} onClick={onClose}>
            <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.instanceIcon}>
                        {instance.name.charAt(0).toUpperCase()}
                    </div>
                    <div className={styles.headerInfo}>
                        <h2 className={styles.title}>{instance.name}</h2>
                        <div className={styles.meta}>
                            <span className={styles.badge}>{instance.version}</span>
                            <span className={styles.badge}>{instance.loader}</span>
                        </div>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={18} />
                    </button>
                </div>

                <div className={styles.sectionDivider} />

                <div className={styles.body}>
                    {actionState !== 'idle' ? (
                        <div className={styles.inputForm}>
                            <label>{actionState === 'renaming' ? 'Rename Instance' : 'Duplicate Instance'}</label>
                            <div className={styles.inputWrapper}>
                                <input
                                    type="text"
                                    value={inputValue}
                                    onChange={e => setInputValue(e.target.value)}
                                    autoFocus
                                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                                    placeholder={actionState === 'renaming' ? 'Enter new name...' : 'Enter copy name...'}
                                />
                            </div>
                            <div className={styles.formActions}>
                                <button className={styles.cancelBtn} onClick={() => setActionState('idle')}>
                                    Cancel
                                </button>
                                <button className={styles.confirmBtn} onClick={handleSubmit}>
                                    {actionState === 'renaming' ? 'Save' : 'Duplicate'}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className={styles.actionsSection}>
                                <div className={styles.sectionLabel}>Actions</div>
                                <div className={styles.actionsGrid}>
                                    <button
                                        className={`${styles.actionBtn} ${!canRename ? styles.disabled : ''}`}
                                        onClick={startRename}
                                        title={canRename ? "Rename Instance" : "Cannot rename external instance"}
                                    >
                                        <Edit2 size={18} />
                                        <span>Rename</span>
                                    </button>
                                    <button className={styles.actionBtn} onClick={startDuplicate}>
                                        <Copy size={18} />
                                        <span>Duplicate</span>
                                    </button>
                                    <button className={styles.actionBtn} onClick={handleExport}>
                                        <Archive size={18} />
                                        <span>Export (.zip)</span>
                                    </button>
                                    <button className={styles.actionBtn} onClick={handleOpenFolder}>
                                        <Folder size={18} />
                                        <span>Open Folder</span>
                                    </button>
                                </div>
                            </div>

                            <div className={styles.dangerSection}>
                                <div className={styles.dangerLabel}>Danger Zone</div>
                                <button className={styles.deleteBtn} onClick={handleDelete} disabled={deleting}>
                                    <Trash2 size={18} />
                                    {deleting ? 'Deleting...' : 'Delete Instance'}
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
