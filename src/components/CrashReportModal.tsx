import React, { useState } from 'react';
import styles from './CrashReportModal.module.css';
import { X, Terminal, CheckCircle, Bug } from 'lucide-react';

interface CrashReport {
    cause: string;
    details: string;
    suggestion: string;
    isDetected: boolean;
}

interface CrashReportModalProps {
    report: CrashReport;
    log: string;
    onClose: () => void;
}

export const CrashReportModal: React.FC<CrashReportModalProps> = ({ report, log, onClose }) => {
    const [showLog, setShowLog] = useState(false);

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <div className={styles.iconWrapper}>
                        <Bug size={24} color="#ef4444" />
                    </div>
                    <div>
                        <h2 className={styles.title}>Game Crashed!</h2>
                        <div className={styles.subtitle}>
                            {report.isDetected ? 'We found the issue.' : 'Something went wrong.'}
                        </div>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.content}>
                    <div className={`${styles.causeCard} ${report.isDetected ? styles.detected : styles.unknown}`}>
                        <div className={styles.causeLabel}>LIKELY CAUSE</div>
                        <div className={styles.causeTitle}>{report.cause}</div>
                        {report.details && <div className={styles.causeDetails}>{report.details}</div>}
                    </div>

                    <div className={styles.suggestionSection}>
                        <div className={styles.sectionTitle}>
                            <CheckCircle size={16} color="#10b981" />
                            Suggested Fix
                        </div>
                        <div className={styles.suggestionText}>
                            {report.suggestion}
                        </div>
                    </div>

                    <div className={styles.logSection}>
                        <button
                            className={styles.logToggle}
                            onClick={() => setShowLog(!showLog)}
                        >
                            <Terminal size={14} />
                            {showLog ? 'Hide Raw Logs' : 'View Raw Logs'}
                        </button>

                        {showLog && (
                            <div className={styles.logViewer}>
                                {log}
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.footer}>
                    <button className={styles.primaryBtn} onClick={onClose}>
                        Acknowledge
                    </button>
                </div>
            </div>
        </div>
    );
};
