import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';
import { Grid, List, RefreshCw, Image as ImageIcon, Trash2, FolderOpen, Copy, Download, Calendar, User, SortDesc } from 'lucide-react';
import { Screenshot, ScreenshotApi } from '../api/screenshots';
import { ScreenshotLightbox } from '../components/ScreenshotLightbox';
import { ScreenshotImage } from '../components/ScreenshotImage';
import { CustomSelect } from '../components/CustomSelect';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import styles from './Screenshots.module.css';

interface ScreenshotsProps {
    user?: any;
    hideHeader?: boolean;
}

export const Screenshots: React.FC<ScreenshotsProps> = ({ hideHeader }) => {
    const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
    const [filteredScreenshots, setFilteredScreenshots] = useState<Screenshot[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
    const [selectedProfile, setSelectedProfile] = useState<string>('all');
    const [dateFilter, setDateFilter] = useState<string>('all');
    const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'name'>('newest');
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
    const { showToast } = useToast();
    const confirm = useConfirm();

    useEffect(() => {
        loadScreenshots();
    }, []);

    useEffect(() => {
        applyFilters();
    }, [screenshots, selectedProfile, dateFilter, sortBy]);

    const loadScreenshots = async () => {
        setLoading(true);
        try {
            const data = await ScreenshotApi.list();
            setScreenshots(data);
        } catch (error) {
            console.error('Failed to load screenshots:', error);
            showToast('Failed to load screenshots', 'error');
        } finally {
            setLoading(false);
        }
    };

    const applyFilters = () => {
        let filtered = [...screenshots];

        // Profile filter
        if (selectedProfile !== 'all') {
            filtered = filtered.filter(s => s.instanceId === selectedProfile);
        }

        // Date filter
        if (dateFilter !== 'all') {
            const now = Date.now();
            const oneDayMs = 24 * 60 * 60 * 1000;

            switch (dateFilter) {
                case 'today':
                    filtered = filtered.filter(s => now - s.date < oneDayMs);
                    break;
                case 'week':
                    filtered = filtered.filter(s => now - s.date < 7 * oneDayMs);
                    break;
                case 'month':
                    filtered = filtered.filter(s => now - s.date < 30 * oneDayMs);
                    break;
            }
        }

        // Sort
        switch (sortBy) {
            case 'newest':
                filtered.sort((a, b) => b.date - a.date);
                break;
            case 'oldest':
                filtered.sort((a, b) => a.date - b.date);
                break;
            case 'name':
                filtered.sort((a, b) => a.filename.localeCompare(b.filename));
                break;
        }

        setFilteredScreenshots(filtered);
    };

    const handleDelete = async (screenshot: Screenshot, event?: React.MouseEvent) => {
        event?.stopPropagation();

        const confirmed = await confirm(
            'Delete Screenshot',
            `Are you sure you want to delete "${screenshot.filename}"? This cannot be undone.`
        );

        if (!confirmed) return;

        const result = await ScreenshotApi.delete(screenshot.path);
        if (result.success) {
            showToast('Screenshot deleted', 'success');
            loadScreenshots();
        } else {
            showToast(result.error || 'Failed to delete screenshot', 'error');
        }
    };

    const handleOpenLocation = async (screenshot: Screenshot, event?: React.MouseEvent) => {
        event?.stopPropagation();
        const result = await ScreenshotApi.openLocation(screenshot.path);
        if (!result.success) {
            showToast(result.error || 'Failed to open location', 'error');
        }
    };

    const handleCopyToClipboard = async (screenshot: Screenshot, event?: React.MouseEvent) => {
        event?.stopPropagation();
        const result = await ScreenshotApi.copyToClipboard(screenshot.path);
        if (result.success) {
            showToast('Screenshot copied to clipboard', 'success');
        } else {
            showToast(result.error || 'Failed to copy screenshot', 'error');
        }
    };

    const handleExport = async (screenshot: Screenshot, event?: React.MouseEvent) => {
        event?.stopPropagation();
        const result = await ScreenshotApi.export(screenshot.path);
        if (result.success && !result.canceled) {
            showToast('Screenshot exported successfully', 'success');
        } else if (result.error) {
            showToast(result.error, 'error');
        }
    };

    const formatDate = (timestamp: number) => {
        const date = new Date(timestamp);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const uniqueProfiles = Array.from(new Set(screenshots.map(s => s.instanceId))).map(id => {
        const screenshot = screenshots.find(s => s.instanceId === id);
        return { id, name: screenshot?.instanceName || id };
    });

    const totalSize = filteredScreenshots.reduce((sum, s) => sum + s.size, 0);

    return (
        <div className={styles.container}>
            {!hideHeader && (
                <PageHeader
                    title="Screenshots"
                    description="View and manage your Minecraft screenshots from all profiles."
                />
            )}

            <div className={styles.stats}>
                <div className={styles.statItem}>
                    <div className={styles.statLabel}>Total</div>
                    <div className={styles.statValue}>{filteredScreenshots.length}</div>
                </div>
                <div className={styles.statItem}>
                    <div className={styles.statLabel}>Size</div>
                    <div className={styles.statValue}>{formatSize(totalSize)}</div>
                </div>
                <div className={styles.statItem}>
                    <div className={styles.statLabel}>Profiles</div>
                    <div className={styles.statValue}>{uniqueProfiles.length}</div>
                </div>
            </div>

            <div className={styles.header}>
                <div className={styles.filters}>
                    <CustomSelect
                        value={selectedProfile}
                        onChange={setSelectedProfile}
                        options={[
                            { value: 'all', label: 'All Profiles', icon: <User size={14} /> },
                            ...uniqueProfiles.map(profile => ({
                                value: profile.id,
                                label: profile.name,
                                icon: <User size={14} />
                            }))
                        ]}
                        width="180px"
                        className={styles.customFilter}
                    />

                    <CustomSelect
                        value={dateFilter}
                        onChange={setDateFilter}
                        options={[
                            { value: 'all', label: 'All Time', icon: <Calendar size={14} /> },
                            { value: 'today', label: 'Today', icon: <Calendar size={14} /> },
                            { value: 'week', label: 'This Week', icon: <Calendar size={14} /> },
                            { value: 'month', label: 'This Month', icon: <Calendar size={14} /> }
                        ]}
                        width="160px"
                        className={styles.customFilter}
                    />

                    <CustomSelect
                        value={sortBy}
                        onChange={(value) => setSortBy(value as any)}
                        options={[
                            { value: 'newest', label: 'Newest First', icon: <SortDesc size={14} /> },
                            { value: 'oldest', label: 'Oldest First', icon: <SortDesc size={14} /> },
                            { value: 'name', label: 'Name (A-Z)', icon: <SortDesc size={14} /> }
                        ]}
                        width="170px"
                        className={styles.customFilter}
                    />
                </div>

                <div className={styles.viewToggle}>
                    <button
                        className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.active : ''}`}
                        onClick={() => setViewMode('grid')}
                        title="Grid View"
                        data-testid="view-grid-btn"
                    >
                        <Grid size={18} />
                    </button>
                    <button
                        className={`${styles.viewBtn} ${viewMode === 'list' ? styles.active : ''}`}
                        onClick={() => setViewMode('list')}
                        title="List View"
                        data-testid="view-list-btn"
                    >
                        <List size={18} />
                    </button>
                </div>

                <button className={styles.refreshBtn} onClick={loadScreenshots} data-testid="refresh-screenshots-btn">
                    <RefreshCw size={18} />
                </button>
            </div>

            {loading ? (
                <div className={styles.loading}>Loading screenshots...</div>
            ) : filteredScreenshots.length === 0 ? (
                <div className={styles.emptyState}>
                    <div className={styles.emptyIcon}>
                        <ImageIcon size={64} />
                    </div>
                    <h3>No screenshots found</h3>
                    <p>Take some screenshots in-game with F2 and they'll appear here!</p>
                </div>
            ) : viewMode === 'grid' ? (
                <div className={styles.screenshotsScrollContainer}>
                    <div className={styles.gridView}>
                        {filteredScreenshots.map((screenshot, index) => (
                            <div
                                key={screenshot.id}
                                className={styles.screenshotCard}
                                onClick={() => setLightboxIndex(index)}
                                data-testid={`screenshot-card-${index}`}
                            >
                                <div className={styles.imageWrapper}>
                                    <ScreenshotImage
                                        screenshot={screenshot}
                                        className={styles.screenshot}
                                        alt={screenshot.filename}
                                    />
                                </div>
                                <div className={styles.cardActions}>
                                    <button
                                        className={styles.actionBtn}
                                        onClick={(e) => handleCopyToClipboard(screenshot, e)}
                                        title="Copy to Clipboard"
                                        data-testid="copy-screenshot-btn"
                                    >
                                        <Copy size={16} />
                                    </button>
                                    <button
                                        className={styles.actionBtn}
                                        onClick={(e) => handleExport(screenshot, e)}
                                        title="Export"
                                        data-testid="export-screenshot-btn"
                                    >
                                        <Download size={16} />
                                    </button>
                                    <button
                                        className={styles.actionBtn}
                                        onClick={(e) => handleOpenLocation(screenshot, e)}
                                        title="Open Location"
                                        data-testid="open-location-btn"
                                    >
                                        <FolderOpen size={16} />
                                    </button>
                                    <button
                                        className={styles.actionBtn}
                                        onClick={(e) => handleDelete(screenshot, e)}
                                        title="Delete"
                                        data-testid="delete-screenshot-btn"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                                <div className={styles.cardInfo}>
                                    <div className={styles.cardTitle}>{screenshot.instanceName}</div>
                                    <div className={styles.cardMeta}>
                                        <span>{formatDate(screenshot.date)}</span>
                                        <span>{formatSize(screenshot.size)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className={styles.screenshotsScrollContainer}>
                    <div className={styles.listView}>
                        {filteredScreenshots.map((screenshot, index) => (
                            <div
                                key={screenshot.id}
                                className={styles.listItem}
                                onClick={() => setLightboxIndex(index)}
                                data-testid={`screenshot-list-item-${index}`}
                            >
                                <ScreenshotImage
                                    screenshot={screenshot}
                                    className={styles.listThumbnail}
                                    alt={screenshot.filename}
                                />
                                <div className={styles.listInfo}>
                                    <div className={styles.listTitle}>{screenshot.filename}</div>
                                    <div className={styles.listMeta}>
                                        <span>{screenshot.instanceName}</span>
                                        <span>•</span>
                                        <span>{screenshot.version} • {screenshot.loader}</span>
                                        <span>•</span>
                                        <span>{formatDate(screenshot.date)}</span>
                                        <span>•</span>
                                        <span>{formatSize(screenshot.size)}</span>
                                    </div>
                                </div>
                                <div className={styles.listActions}>
                                    <button
                                        className={styles.actionBtn}
                                        onClick={(e) => handleCopyToClipboard(screenshot, e)}
                                        title="Copy to Clipboard"
                                    >
                                        <Copy size={16} />
                                    </button>
                                    <button
                                        className={styles.actionBtn}
                                        onClick={(e) => handleExport(screenshot, e)}
                                        title="Export"
                                    >
                                        <Download size={16} />
                                    </button>
                                    <button
                                        className={styles.actionBtn}
                                        onClick={(e) => handleOpenLocation(screenshot, e)}
                                        title="Open Location"
                                    >
                                        <FolderOpen size={16} />
                                    </button>
                                    <button
                                        className={styles.actionBtn}
                                        onClick={(e) => handleDelete(screenshot, e)}
                                        title="Delete"
                                    >
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {lightboxIndex !== null && (
                <ScreenshotLightbox
                    screenshots={filteredScreenshots}
                    initialIndex={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                    onDelete={handleDelete}
                    onCopy={handleCopyToClipboard}
                    onExport={handleExport}
                    onOpenLocation={handleOpenLocation}
                />
            )}
        </div>
    );
};
