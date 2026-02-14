import React, { useState, useEffect } from 'react';
import styles from './ModpackInstallModal.module.css';
import { X, Check } from 'lucide-react';
import { Skeleton } from './Skeleton';
import { useToast } from '../context/ToastContext';

interface ModpackInstallModalProps {
    modpack: {
        id: string;
        title: string;
        imageUrl: string;
    };
    onClose: () => void;
    onInstallStarted: () => void;
}

interface PackVersion {
    id: string;
    name: string;
    version_number: string;
    game_versions: string[];
    loaders: string[];
    files: any[];
}

export const ModpackInstallModal: React.FC<ModpackInstallModalProps> = ({ modpack, onClose, onInstallStarted }) => {
    const { showToast } = useToast();
    const [versions, setVersions] = useState<PackVersion[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedVersion, setSelectedVersion] = useState<PackVersion | null>(null);
    const [installing, setInstalling] = useState(false);
    const [status, setStatus] = useState('');
    const [installProgress, setInstallProgress] = useState(0);

    useEffect(() => {
        // Listen for progress
        const handleProgress = (_: any, data: any) => {
            setStatus(data.status);
            setInstallProgress(data.progress || 0);
        };
        window.ipcRenderer.on('modpack:install-progress', handleProgress);
        return () => {
            window.ipcRenderer.off('modpack:install-progress', handleProgress);
        };
    }, []);

    useEffect(() => {
        const fetchVersions = async () => {
            setLoading(true);
            try {
                const result = await window.ipcRenderer.invoke('modpack:get-versions', modpack.id, 'modrinth');
                if (result.success) {
                    setVersions(result.versions);
                    if (result.versions.length > 0) {
                        setSelectedVersion(result.versions[0]);
                    }
                } else {
                    console.error(result.error);
                }
            } catch (e) {
                console.error("Failed to fetch versions", e);
            } finally {
                setLoading(false);
            }
        };
        fetchVersions();
    }, [modpack.id]);





    const handleInstall = async () => {
        if (!selectedVersion) return;
        setInstalling(true);
        setStatus('Initializing...');
        setInstallProgress(0);

        try {
            const result = await window.ipcRenderer.invoke('modpack:install', {
                versionId: selectedVersion.id,
                projectId: modpack.id,
                projectName: modpack.title,
                versionNumber: selectedVersion.version_number,
                loader: selectedVersion.loaders[0],
                gameVersion: selectedVersion.game_versions[0],
                iconUrl: modpack.imageUrl
            });

            if (result.success) {
                showToast(`Successfully installed ${modpack.title}!`, 'success');
                onInstallStarted();
                onClose();
            } else {
                const msg = `Error: ${result.error}`;
                setStatus(msg);
                showToast(msg, 'error');
                setInstalling(false);
            }
        } catch (e) {
            console.error(e);
            setStatus('Failed.');
            showToast('Failed to install modpack.', 'error');
            setInstalling(false);
        }
    };

    return (
        <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget && !installing) onClose(); }}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <h2>Install {modpack.title}</h2>
                    <button className={styles.closeBtn} onClick={onClose} disabled={installing}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.content}>
                    <div className={styles.packInfo}>
                        <img src={modpack.imageUrl} alt="" className={styles.packIcon} />
                        <div className={styles.packMeta}>
                            <h3>Select Version</h3>
                            <p>Choose which version you want to play.</p>
                        </div>
                    </div>

                    <div className={styles.versionList}>
                        {loading ? (
                            <>
                                <Skeleton width="100%" height={50} style={{ borderRadius: 8, marginBottom: 4 }} />
                                <Skeleton width="100%" height={50} style={{ borderRadius: 8, marginBottom: 4 }} />
                                <Skeleton width="100%" height={50} style={{ borderRadius: 8 }} />
                            </>
                        ) : versions.length === 0 ? (
                            <div style={{ color: '#666', textAlign: 'center', padding: 20 }}>No versions found.</div>
                        ) : (
                            versions.map(ver => (
                                <div
                                    key={ver.id}
                                    className={`${styles.versionItem} ${selectedVersion?.id === ver.id ? styles.selected : ''}`}
                                    onClick={() => !installing && setSelectedVersion(ver)}
                                >
                                    <div>
                                        <div className={styles.versionName}>{ver.version_number}</div>
                                        <div className={styles.versionMeta}>
                                            MC {ver.game_versions.join(', ')} • {ver.loaders.join(', ')}
                                        </div>
                                    </div>
                                    {selectedVersion?.id === ver.id && <Check size={18} color="#ffaa00" />}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                <div className={styles.footer}>
                    {installing ? (
                        <div style={{ width: '100%' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: '0.85em', color: '#ccc' }}>
                                <span>{status}</span>
                                <span>{installProgress}%</span>
                            </div>
                            <div style={{ width: '100%', height: 6, background: '#333', borderRadius: 3, overflow: 'hidden' }}>
                                <div style={{ width: `${installProgress}%`, height: '100%', background: '#ffaa00', transition: 'width 0.2s' }} />
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className={styles.status} style={{ color: status.startsWith('Error') ? '#f87171' : '#a1a1aa' }}>
                                {status}
                            </div>
                            <div className={styles.actions}>
                                <button className={styles.cancelBtn} onClick={onClose} disabled={installing}>Cancel</button>
                                <button
                                    className={styles.installBtn}
                                    onClick={handleInstall}
                                    disabled={!selectedVersion || installing}
                                >
                                    Install Modpack
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
