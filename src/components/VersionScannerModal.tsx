import React, { useState, useEffect } from 'react';
import styles from './VersionScannerModal.module.css';
import { X, Check, Loader2, FolderSearch, Package } from 'lucide-react';

interface ScannedVersion {
    id: string;
    name: string;
    version: string;
    loader: string;
}

interface VersionScannerModalProps {
    onClose: () => void;
    onImport: (selectedVersions: ScannedVersion[]) => void;
}

export const VersionScannerModal: React.FC<VersionScannerModalProps> = ({ onClose, onImport }) => {
    const [scanning, setScanning] = useState(true);
    const [progress, setProgress] = useState({ current: 0, total: 0, currentName: '' });
    const [versions, setVersions] = useState<ScannedVersion[]>([]);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const startScan = async () => {
            // Listen for progress updates
            const progressHandler = (_: any, data: { progress: number; total: number; current: string }) => {
                setProgress({ current: data.progress, total: data.total, currentName: data.current });
            };

            window.ipcRenderer.on('config:scan-progress', progressHandler);

            try {
                const result = await window.ipcRenderer.invoke('config:scan-versions');

                if (result.success) {
                    setVersions(result.versions);
                    // Pre-select all by default
                    setSelectedIds(new Set(result.versions.map((v: ScannedVersion) => v.id)));
                } else {
                    setError(result.error || 'Failed to scan versions');
                }
            } catch (e) {
                setError(String(e));
            } finally {
                setScanning(false);
                window.ipcRenderer.off('config:scan-progress', progressHandler);
            }
        };

        startScan();
    }, []);

    const toggleVersion = (id: string) => {
        const newSet = new Set(selectedIds);
        if (newSet.has(id)) {
            newSet.delete(id);
        } else {
            newSet.add(id);
        }
        setSelectedIds(newSet);
    };

    const toggleAll = () => {
        if (selectedIds.size === versions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(versions.map(v => v.id)));
        }
    };

    const handleImport = () => {
        const selected = versions.filter(v => selectedIds.has(v.id));
        onImport(selected);
        onClose();
    };

    const getLoaderColor = (loader: string) => {
        switch (loader) {
            case 'fabric': return '#dbb78d';
            case 'forge': return '#ff6b35';
            case 'neoforge': return '#f5a524';
            case 'quilt': return '#9b59b6';
            default: return '#666';
        }
    };

    return (
        <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && !scanning && onClose()}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <FolderSearch size={20} />
                    <h2>Scan Versions</h2>
                    {!scanning && (
                        <button className={styles.closeBtn} onClick={onClose}>
                            <X size={18} />
                        </button>
                    )}
                </div>

                {scanning ? (
                    <div className={styles.scanningContainer}>
                        <Loader2 size={48} className={styles.spinner} />
                        <div className={styles.scanStatus}>Scanning versions...</div>
                        {progress.total > 0 && (
                            <>
                                <div className={styles.progressBar}>
                                    <div
                                        className={styles.progressFill}
                                        style={{ width: `${(progress.current / progress.total) * 100}%` }}
                                    />
                                </div>
                                <div className={styles.progressText}>
                                    {progress.current} / {progress.total} • {progress.currentName}
                                </div>
                            </>
                        )}
                    </div>
                ) : error ? (
                    <div className={styles.errorContainer}>
                        <div className={styles.errorText}>{error}</div>
                        <button className={styles.actionBtn} onClick={onClose}>Close</button>
                    </div>
                ) : versions.length === 0 ? (
                    <div className={styles.emptyContainer}>
                        <Package size={48} color="#666" />
                        <div className={styles.emptyText}>No versions found in game folder</div>
                        <div className={styles.emptyHint}>
                            Make sure your game path points to a .minecraft folder with versions installed.
                        </div>
                        <button className={styles.actionBtn} onClick={onClose}>Close</button>
                    </div>
                ) : (
                    <>
                        <div className={styles.controls}>
                            <button className={styles.selectAllBtn} onClick={toggleAll}>
                                {selectedIds.size === versions.length ? 'Deselect All' : 'Select All'}
                            </button>
                            <span className={styles.countText}>
                                {selectedIds.size} of {versions.length} selected
                            </span>
                        </div>

                        <div className={styles.versionList}>
                            {versions.map(version => (
                                <div
                                    key={version.id}
                                    className={`${styles.versionItem} ${selectedIds.has(version.id) ? styles.selected : ''}`}
                                    onClick={() => toggleVersion(version.id)}
                                >
                                    <div className={styles.checkbox}>
                                        {selectedIds.has(version.id) && <Check size={14} />}
                                    </div>
                                    <div className={styles.versionInfo}>
                                        <div className={styles.versionName}>{version.name}</div>
                                        <div className={styles.versionMeta}>
                                            <span>{version.version}</span>
                                            <span
                                                className={styles.loaderBadge}
                                                style={{ borderColor: getLoaderColor(version.loader), color: getLoaderColor(version.loader) }}
                                            >
                                                {version.loader}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className={styles.footer}>
                            <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                            <button
                                className={styles.importBtn}
                                onClick={handleImport}
                                disabled={selectedIds.size === 0}
                            >
                                Import {selectedIds.size} Version{selectedIds.size !== 1 ? 's' : ''}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
