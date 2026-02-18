import React, { useState, useEffect } from 'react';
import styles from './ModpackBrowser.module.css';
import { Search, Download, Upload, ChevronRight, Package, Users, Calendar, Loader2, Layers, ChevronDown, X, ExternalLink, Info, WifiOff } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { InstanceApi } from '../api/instances';
import { ProcessingModal } from '../components/ProcessingModal';
import { useToast } from '../context/ToastContext';
import { Skeleton } from '../components/Skeleton';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';

interface Modpack {
    project_id: string;
    slug: string;
    title: string;
    description: string;
    categories: string[];
    versions: string[];
    downloads: number;
    follows: number;
    icon_url?: string;
    author: string;
    date_modified: string;
    featured_gallery?: string;
}

interface ModpackVersion {
    id: string;
    version_number: string;
    name: string;
    game_versions: string[];
    loaders: string[];
    downloads: number;
    date_published: string;
    files: any[];
}

export const ModpackBrowser: React.FC = () => {
    const [query, setQuery] = useState('');
    const [modpacks, setModpacks] = useState<Modpack[]>([]);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // ... (existing state code omitted for brevity as it's not changing, but using replace_file_content I need to be careful with context. 
    // Actually, since I'm targeting the top part, I'll just change the props interface and the render method part)

    // Wait, replace_file_content requires exact match. I should probably use multi_replace.
    // Let's stick to replace_file_content but targeting specific blocks.
    const [loading, setLoading] = useState(true);

    // Selection State
    const [selectedPack, setSelectedPack] = useState<Modpack | null>(null);
    const [packDetails, setPackDetails] = useState<any>(null);
    const [versions, setVersions] = useState<ModpackVersion[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<ModpackVersion | null>(null);
    const [loadingDetails, setLoadingDetails] = useState(false);
    const [showVersionDropdown, setShowVersionDropdown] = useState(false);

    // Install State
    const [installing, setInstalling] = useState(false);
    const [installProgress, setInstallProgress] = useState<{ message: string; progress: number } | null>(null);

    // Web View State
    const [viewingUrl, setViewingUrl] = useState<string | null>(null);

    const { showToast } = useToast();

    // Internet check
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Initial load
    useEffect(() => {
        if (isOnline) loadFeatured();
    }, [isOnline]);

    // Progress listener
    useEffect(() => {
        const handler = (_: any, data: { status: string; progress: number }) => {
            setInstallProgress({ message: data.status, progress: data.progress });
        };
        window.ipcRenderer.on('modpack:install-progress', handler);
        return () => { window.ipcRenderer.off('modpack:install-progress', handler); };
    }, []);

    // Debounced search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (query.trim()) {
                searchModpacks(query);
            } else {
                loadFeatured();
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [query]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = () => setShowVersionDropdown(false);
        if (showVersionDropdown) {
            document.addEventListener('click', handleClick);
            return () => document.removeEventListener('click', handleClick);
        }
    }, [showVersionDropdown]);

    const loadFeatured = async () => {
        setLoading(true);
        try {
            const res = await window.ipcRenderer.invoke('modpack:get-featured');
            if (res.success) {
                setModpacks(res.hits);
                if (res.hits.length > 0 && !selectedPack) {
                    handleSelectPack(res.hits[0]);
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const searchModpacks = async (q: string) => {
        setLoading(true);
        try {
            const res = await window.ipcRenderer.invoke('modpack:search', q, { limit: 20 });
            if (res.success) {
                setModpacks(res.hits);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectPack = async (pack: Modpack) => {
        if (selectedPack?.project_id === pack.project_id) return;

        setSelectedPack(pack);
        setLoadingDetails(true);
        setPackDetails(null);
        setVersions([]);
        setSelectedVersion(null);

        try {
            const [projectRes, versionsRes] = await Promise.all([
                window.ipcRenderer.invoke('modpack:get-project', pack.project_id),
                window.ipcRenderer.invoke('modpack:get-versions', pack.project_id)
            ]);

            if (projectRes.success) setPackDetails(projectRes.project);
            if (versionsRes.success) {
                setVersions(versionsRes.versions);
                if (versionsRes.versions.length > 0) {
                    setSelectedVersion(versionsRes.versions[0]);
                }
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingDetails(false);
        }
    };

    const handleInstall = async () => {
        if (!selectedPack || !selectedVersion) return;

        setInstalling(true);
        setInstallProgress({ message: 'Preparing installation...', progress: 0 });

        try {
            const res = await window.ipcRenderer.invoke('modpack:install', {
                versionId: selectedVersion.id,
                projectId: selectedPack.project_id,
                projectName: selectedPack.title,
                iconUrl: selectedPack.icon_url
            });

            if (res.success) {
                showToast(`${selectedPack.title} installed successfully!`, 'success');
            } else {
                showToast(res.error || 'Installation failed', 'error');
            }
        } catch (e: any) {
            showToast(e.message || 'Installation failed', 'error');
        } finally {
            setInstalling(false);
            setInstallProgress(null);
        }
    };

    const handleImportFile = async () => {
        setInstalling(true);
        setInstallProgress({ message: 'Importing modpack...', progress: 0 });
        try {
            const res = await InstanceApi.import();
            if (res.success) {
                showToast('Modpack imported successfully!', 'success');
            } else if (res.error) {
                showToast(res.error, 'error');
            }
        } catch (e: any) {
            showToast(e.message || 'Import failed', 'error');
        } finally {
            setInstalling(false);
            setInstallProgress(null);
        }
    };

    const formatNumber = (n: number) => {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
        return n.toString();
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
        <div className={styles.container}>
            <div className={styles.header}>
                <PageHeader
                    title="Modpacks"
                    description="Browse and install modpacks from Modrinth."
                />
                <button className={styles.importBtn} onClick={handleImportFile}>
                    <Upload size={18} />
                    <span>Import File</span>
                </button>
            </div>

            <div className={styles.content}>
                {!isOnline && (
                    <div style={{
                        position: 'absolute', inset: 0, zIndex: 50,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', borderRadius: 16, gap: 12
                    }}>
                        <WifiOff size={48} color="#ff8800" strokeWidth={1.5} />
                        <h3 style={{ color: '#fff', margin: 0, fontWeight: 600 }}>No Internet Connection</h3>
                        <p style={{ color: '#71717a', fontSize: 14, margin: 0 }}>Connect to the internet to browse modpacks</p>
                    </div>
                )}
                {/* Left Panel: Search & List */}
                <div className={styles.leftPanel}>
                    <div className={styles.searchWrapper}>
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            className={styles.searchInput}
                            placeholder="Search modpacks..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                        />
                    </div>

                    <div className={styles.packList}>
                        {loading && modpacks.length === 0 ? (
                            Array.from({ length: 8 }).map((_, i) => (
                                <div key={i} className={styles.skeletonCard}>
                                    <Skeleton width={44} height={44} style={{ borderRadius: 10, flexShrink: 0 }} />
                                    <div style={{ flex: 1 }}>
                                        <Skeleton width="80%" height={14} />
                                        <Skeleton width="40%" height={10} style={{ marginTop: 6 }} />
                                    </div>
                                </div>
                            ))
                        ) : modpacks.length === 0 ? (
                            <div className={styles.emptyState}>
                                <Package size={40} strokeWidth={1} />
                                <p>No modpacks found</p>
                            </div>
                        ) : (
                            modpacks.map(pack => (
                                <div
                                    key={pack.project_id}
                                    className={`${styles.packCard} ${selectedPack?.project_id === pack.project_id ? styles.selected : ''}`}
                                    onClick={() => handleSelectPack(pack)}
                                >
                                    <div className={styles.packIcon}>
                                        {pack.icon_url ? (
                                            <img src={pack.icon_url} alt={pack.title} />
                                        ) : (
                                            <Layers size={22} />
                                        )}
                                    </div>
                                    <div className={styles.packInfo}>
                                        <div className={styles.packTitle}>{pack.title}</div>
                                        <div className={styles.packMeta}>by {pack.author} • {formatNumber(pack.downloads)}</div>
                                    </div>
                                    {selectedPack?.project_id === pack.project_id && (
                                        <ChevronRight size={16} className={styles.selectedArrow} />
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </div>

                {/* Right Panel: Details */}
                <div className={styles.rightPanel}>
                    {selectedPack ? (
                        <div className={styles.detailContainer}>
                            <div className={styles.detailHeader}>
                                <div className={styles.detailIcon}>
                                    {selectedPack.icon_url ? (
                                        <img src={selectedPack.icon_url} alt={selectedPack.title} />
                                    ) : (
                                        <Package size={40} />
                                    )}
                                </div>
                                <div className={styles.detailTitleArea}>
                                    <h1>{selectedPack.title}</h1>
                                    <p className={styles.detailAuthor}>by {selectedPack.author}</p>

                                    {/* Install Controls in Header */}
                                    <div className={styles.headerControls}>
                                        <div className={styles.versionSelector} onClick={(e) => { e.stopPropagation(); setShowVersionDropdown(!showVersionDropdown); }}>
                                            <span>
                                                {loadingDetails ? 'Loading...' : selectedVersion ? `${selectedVersion.version_number} (${selectedVersion.game_versions[0]})` : 'Select Version'}
                                            </span>
                                            <ChevronDown size={16} />

                                            {showVersionDropdown && versions.length > 0 && (
                                                <div
                                                    className={styles.versionDropdown}
                                                    onClick={e => e.stopPropagation()}
                                                    onWheel={(e) => e.stopPropagation()}
                                                >
                                                    <div className={styles.versionSearchContainer}>
                                                        <Search size={14} className={styles.versionSearchIcon} />
                                                        <input
                                                            autoFocus
                                                            className={styles.versionSearchInput}
                                                            placeholder="Search version..."
                                                            onClick={e => e.stopPropagation()}
                                                            onChange={(e) => {
                                                                const val = e.target.value.toLowerCase();
                                                                const items = document.querySelectorAll(`.${styles.versionOption}`);
                                                                items.forEach((item: any) => {
                                                                    const text = item.innerText.toLowerCase();
                                                                    item.style.display = text.includes(val) ? 'flex' : 'none';
                                                                });
                                                            }}
                                                        />
                                                    </div>
                                                    <div className={styles.versionScrollArea}>
                                                        {versions.map(ver => (
                                                            <div
                                                                key={ver.id}
                                                                className={`${styles.versionOption} ${selectedVersion?.id === ver.id ? styles.activeOption : ''}`}
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedVersion(ver);
                                                                    setShowVersionDropdown(false);
                                                                }}
                                                            >
                                                                <span className={styles.optionVersion}>{ver.version_number}</span>
                                                                <span className={styles.optionMeta}>{ver.game_versions[0]} • {ver.loaders[0]}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <button
                                            className={styles.installButton}
                                            disabled={!selectedVersion || installing || !isOnline}
                                            onClick={handleInstall}
                                            title={!isOnline ? 'Internet connection required to install modpacks' : ''}
                                        >
                                            {!isOnline ? (
                                                <WifiOff size={18} />
                                            ) : installing ? (
                                                <Loader2 className={styles.spinner} size={18} />
                                            ) : (
                                                <Download size={18} />
                                            )}
                                            <span>{!isOnline ? 'Offline' : installing ? 'Installing...' : 'Install'}</span>
                                        </button>
                                    </div>
                                </div>

                            </div>

                            <div className={styles.statsRow}>
                                <div className={styles.statItem}>
                                    <Download size={20} />
                                    <div className={styles.statValue}>{formatNumber(selectedPack.downloads)}</div>
                                    <div className={styles.statLabel}>Downloads</div>
                                </div>
                                <div className={styles.statItem}>
                                    <Users size={20} />
                                    <div className={styles.statValue}>{formatNumber(selectedPack.follows)}</div>
                                    <div className={styles.statLabel}>Followers</div>
                                </div>
                                <div className={styles.statItem}>
                                    <Calendar size={20} />
                                    <div className={styles.statValue}>{formatDate(selectedPack.date_modified)}</div>
                                    <div className={styles.statLabel}>Updated</div>
                                </div>
                            </div>

                            {/* Install Section */}


                            <div className={styles.descriptionSection}>
                                <h3>
                                    <Info size={14} />
                                    About this modpack
                                </h3>
                                <div className={styles.markdownContent}>
                                    {loadingDetails ? (
                                        <div className={styles.descLoading}>
                                            <Skeleton width="100%" height={16} />
                                            <Skeleton width="80%" height={16} />
                                            <Skeleton width="90%" height={16} />
                                        </div>
                                    ) : (
                                        <ReactMarkdown
                                            rehypePlugins={[rehypeRaw]}
                                            remarkPlugins={[remarkGfm, remarkBreaks]}
                                            components={{
                                                a: ({ node, ...props }) => (
                                                    <a
                                                        {...props}
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            if (props.href) setViewingUrl(props.href);
                                                        }}
                                                        style={{ cursor: 'pointer', color: '#ffaa00', textDecoration: 'underline' }}
                                                    />
                                                ),
                                                img: ({ node, ...props }) => (
                                                    <img {...props} style={{ maxWidth: '100%', borderRadius: '12px', margin: '16px 0' }} />
                                                )
                                            }}
                                        >
                                            {packDetails?.body || selectedPack.description}
                                        </ReactMarkdown>
                                    )}
                                </div>
                            </div>
                        </div>
                    ) : loading ? (
                        <div className={styles.detailsSkeleton}>
                            <div className={styles.skeletonHeader}>
                                <div className={styles.skeletonIcon} />
                                <div className={styles.skeletonTitleBlock}>
                                    <div className={styles.skeletonLine} />
                                    <div className={styles.skeletonLineShort} />
                                </div>
                            </div>
                            <div className={styles.statsRow}>
                                <div className={styles.statItem} style={{ height: 80, padding: 0 }} />
                                <div className={styles.statItem} style={{ height: 80, padding: 0 }} />
                                <div className={styles.statItem} style={{ height: 80, padding: 0 }} />
                            </div>
                            <div className={styles.skeletonLine} style={{ width: '100%', height: 60, marginBottom: 40 }} />
                            <div className={styles.skeletonContentBlock}>
                                <div className={styles.skeletonLine} style={{ width: '100%', height: 20 }} />
                                <div className={styles.skeletonLine} style={{ width: '92%', height: 20 }} />
                                <div className={styles.skeletonLine} style={{ width: '96%', height: 20 }} />
                                <div className={styles.skeletonLine} style={{ width: '85%', height: 20 }} />
                                <div className={styles.skeletonLine} style={{ width: '90%', height: 20 }} />
                            </div>
                        </div>
                    ) : (
                        <div className={styles.landingState}>
                            <div className={styles.landingBgIcon}>
                                <Package />
                            </div>
                            <div className={styles.landingContent}>
                                <div className={styles.landingIconCircle}>
                                    <Package size={40} strokeWidth={1.5} />
                                </div>
                                <h2 className={styles.landingTitle}>Select a Modpack</h2>
                                <p className={styles.landingText}>
                                    Browse the collection on the left and select a modpack to view its details, versions, and installation options.
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Progress Overlay */}
            {installing && installProgress && (
                <ProcessingModal
                    message="Installing Modpack"
                    subMessage={installProgress.message}
                    progress={installProgress.progress}
                />
            )}

            {/* Web View Overlay */}
            {viewingUrl && (
                <div className={styles.webOverlay}>
                    <iframe src={viewingUrl} className={styles.webFrame} title="External Content" />

                    <div className={styles.webDock}>
                        <div className={styles.dockInfo}>
                            <ExternalLink size={16} />
                            <span className={styles.dockUrl}>{viewingUrl}</span>
                        </div>
                        <button className={styles.dockCloseBtn} onClick={() => setViewingUrl(null)}>
                            <X size={18} />
                            Close
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
