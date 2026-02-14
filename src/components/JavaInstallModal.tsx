import React, { useState, useEffect } from 'react';
import styles from './JavaInstallModal.module.css';
import { Download, Coffee } from 'lucide-react';

interface JavaInstallDetails {
    version: string;
    sizeInBytes: number;
}

export const JavaInstallModal: React.FC = () => {
    const [details, setDetails] = useState<JavaInstallDetails | null>(null);
    const [progress, setProgress] = useState<number>(0);
    const [status, setStatus] = useState<string>('Waiting');
    const [installing, setInstalling] = useState(false);

    useEffect(() => {
        const handleReq = (_: any, data: JavaInstallDetails) => {
            console.log("Java Install Requested", data);
            setDetails(data);
            setProgress(0);
            setStatus(`Java ${data.version} is required`);
            setInstalling(false);
        };

        const handleProgress = (_: any, data: { status: string, progress: number }) => {
            setStatus(data.status);
            setProgress(data.progress);
        };

        const handleDone = () => {
            setDetails(null);
        };

        window.ipcRenderer.on('java-install-request', handleReq);
        window.ipcRenderer.on('java-install-progress', handleProgress);
        window.ipcRenderer.on('java-install-done', handleDone);

        return () => {
            window.ipcRenderer.off('java-install-request', handleReq);
            window.ipcRenderer.off('java-install-progress', handleProgress);
            window.ipcRenderer.off('java-install-done', handleDone);
        };
    }, []);

    const handleConfirm = () => {
        setInstalling(true);
        window.ipcRenderer.send('java-install-consent', 'install');
    };

    const handleSkip = () => {
        window.ipcRenderer.send('java-install-consent', 'skip');
        setDetails(null);
    };

    const handleCancel = () => {
        window.ipcRenderer.send('java-install-consent', 'cancel');
        setDetails(null);
    };

    if (!details) return null;

    const sizeMB = (details.sizeInBytes / 1024 / 1024).toFixed(1);

    return (
        <div className={styles.overlay}>
            <div className={styles.heroPanel}>
                <div className={styles.visualSide}>
                    <div className={styles.iconHero}>
                        <Coffee size={48} color="#fff" strokeWidth={1.5} />
                    </div>
                    <div className={styles.versionBadge}>
                        <span>VERSION</span>
                        <strong>{details.version}</strong>
                    </div>
                </div>

                <div className={styles.contentSide}>
                    {!installing ? (
                        <>
                            <div className={styles.headerArea}>
                                <span className={styles.label}>Component Required</span>
                                <h1 className={styles.mainTitle}>Java Runtime<br />Environment</h1>
                                <p className={styles.description}>
                                    This modpack requires a specific Java runtime to function correctly.
                                    We'll handle the setup for you.
                                </p>
                            </div>

                            <div className={styles.actionArea}>
                                <button className={styles.primaryBtn} onClick={handleConfirm}>
                                    <div className={styles.btnDetails}>
                                        <span>Download & Install</span>
                                        <span className={styles.btnSub}>{sizeMB} MB • Automated Setup</span>
                                    </div>
                                    <Download size={20} />
                                </button>

                                <div className={styles.secondaryActions}>
                                    <button className={styles.secondaryBtn} onClick={handleSkip}>
                                        Skip (Use System)
                                    </button>
                                    <button className={styles.secondaryBtn} onClick={handleCancel}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className={styles.progressMode}>
                            <div>
                                <h2 className={styles.mainTitle} style={{ fontSize: 24 }}>Installing Java...</h2>
                                <p className={styles.description}>Please wait while we set things up.</p>
                            </div>

                            <div>
                                <div className={styles.progressLabel}>
                                    <span>{status}</span>
                                    <span>{Math.round(progress)}%</span>
                                </div>
                                <div className={styles.progressTrack}>
                                    <div
                                        className={styles.progressBar}
                                        style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
