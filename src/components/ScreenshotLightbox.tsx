import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Copy, Download, FolderOpen, Trash2 } from 'lucide-react';
import { Screenshot } from '../api/screenshots';
import { ScreenshotImage } from './ScreenshotImage';
import styles from './ScreenshotLightbox.module.css';

interface ScreenshotLightboxProps {
    screenshots: Screenshot[];
    initialIndex: number;
    onClose: () => void;
    onDelete: (screenshot: Screenshot) => void;
    onCopy: (screenshot: Screenshot) => void;
    onExport: (screenshot: Screenshot) => void;
    onOpenLocation: (screenshot: Screenshot) => void;
}

export const ScreenshotLightbox: React.FC<ScreenshotLightboxProps> = ({
    screenshots,
    initialIndex,
    onClose,
    onDelete,
    onCopy,
    onExport,
    onOpenLocation
}) => {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const currentScreenshot = screenshots[currentIndex];

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            if (e.key === 'ArrowLeft') handlePrevious();
            if (e.key === 'ArrowRight') handleNext();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [currentIndex]);

    const handleNext = () => {
        if (currentIndex < screenshots.length - 1) {
            setCurrentIndex(currentIndex + 1);
        }
    };

    const handlePrevious = () => {
        if (currentIndex > 0) {
            setCurrentIndex(currentIndex - 1);
        }
    };

    const formatDate = (timestamp: number) => {
        return new Date(timestamp).toLocaleString();
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.lightbox} onClick={(e) => e.stopPropagation()}>
                <button className={styles.closeBtn} onClick={onClose} data-testid="lightbox-close-btn">
                    <X size={24} />
                </button>

                {currentIndex > 0 && (
                    <button className={styles.navBtn} onClick={handlePrevious} style={{ left: 20 }} data-testid="lightbox-prev-btn">
                        <ChevronLeft size={32} />
                    </button>
                )}

                {currentIndex < screenshots.length - 1 && (
                    <button className={styles.navBtn} onClick={handleNext} style={{ right: 20 }} data-testid="lightbox-next-btn">
                        <ChevronRight size={32} />
                    </button>
                )}

                <div className={styles.imageContainer}>
                    <ScreenshotImage
                        screenshot={currentScreenshot}
                        className={styles.image}
                    />
                </div>

                <div className={styles.info}>
                    <div className={styles.infoHeader}>
                        <div>
                            <div className={styles.title}>{currentScreenshot.filename}</div>
                            <div className={styles.meta}>
                                {currentScreenshot.instanceName} • {currentScreenshot.version} • {formatDate(currentScreenshot.date)} • {formatSize(currentScreenshot.size)}
                            </div>
                        </div>
                        <div className={styles.counter}>
                            {currentIndex + 1} / {screenshots.length}
                        </div>
                    </div>

                    <div className={styles.actions}>
                        <button
                            className={styles.actionBtn}
                            onClick={() => onCopy(currentScreenshot)}
                            data-testid="lightbox-copy-btn"
                        >
                            <Copy size={18} />
                            Copy
                        </button>
                        <button
                            className={styles.actionBtn}
                            onClick={() => onExport(currentScreenshot)}
                            data-testid="lightbox-export-btn"
                        >
                            <Download size={18} />
                            Export
                        </button>
                        <button
                            className={styles.actionBtn}
                            onClick={() => onOpenLocation(currentScreenshot)}
                            data-testid="lightbox-open-location-btn"
                        >
                            <FolderOpen size={18} />
                            Open Location
                        </button>
                        <button
                            className={`${styles.actionBtn} ${styles.deleteBtn}`}
                            onClick={() => {
                                onDelete(currentScreenshot);
                                if (screenshots.length === 1) {
                                    onClose();
                                } else if (currentIndex === screenshots.length - 1) {
                                    setCurrentIndex(currentIndex - 1);
                                }
                            }}
                            data-testid="lightbox-delete-btn"
                        >
                            <Trash2 size={18} />
                            Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
