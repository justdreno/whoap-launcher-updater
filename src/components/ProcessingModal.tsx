import React from 'react';
import styles from './ProcessingModal.module.css';

interface ProcessingModalProps {
    message: string;
    subMessage?: string;
    progress?: number; // 0 to 100
}

export const ProcessingModal: React.FC<ProcessingModalProps> = ({ message, subMessage, progress }) => {
    return (
        <div className={styles.overlay}>
            {!progress && <div className={styles.spinner}></div>}
            <div className={styles.message}>{message}</div>
            {subMessage && <div className={styles.subMessage}>{subMessage}</div>}

            {progress !== undefined && (
                <div className={styles.progressContainer}>
                    <div className={styles.progressLabel}>{Math.round(progress)}%</div>
                    <div className={styles.progressBar}>
                        <div
                            className={styles.progressFill}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};
