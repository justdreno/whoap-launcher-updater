import React, { useState, useEffect } from 'react';
import styles from './ModBrowser.module.css';
import { Search, Download, Check, AlertTriangle, Package, CheckCircle, X, Sparkles, Layers, WifiOff, RefreshCw } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import ReactMarkdown from 'react-markdown';

export type ContentType = 'mod' | 'resourcepack' | 'shader';

interface ContentBrowserProps {
    instanceId: string;
    version: string;
    loader: string;
    type: ContentType;
    onClose: () => void;
}

interface Project {
    project_id: string;
    title: string;
    description: string;
    icon_url?: string;
    author: string;
    downloads: number;
    categories?: string[];
}

interface InstallStatus {
    modName: string;
    status: 'pending' | 'downloading' | 'installed' | 'skipped' | 'failed';
    error?: string;
}

export const ContentBrowser: React.FC<ContentBrowserProps> = ({ instanceId, version, loader, type, onClose }) => {
    const [query, setQuery] = useState('');
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [activeVersion, setActiveVersion] = useState<any | null>(null);
    const [installing, setInstalling] = useState(false);
    const [progress, setProgress] = useState<string>('');
    const [installPercent, setInstallPercent] = useState(0);
    const [installedItems, setInstalledItems] = useState<Set<string>>(new Set());
    const [loadingVersion, setLoadingVersion] = useState(false);
    const [dependencyNames, setDependencyNames] = useState<{ [key: string]: string }>({});
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [updateStatus, setUpdateStatus] = useState<{ [projectId: string]: { hasUpdate: boolean; currentVersion?: string; currentFilename?: string } }>({});
    const { showToast } = useToast();

    const config = {
        mod: { title: 'Mod Browser', icon: Package, ipcPrefix: 'mods' },
        resourcepack: { title: 'Resource Pack Browser', icon: Layers, ipcPrefix: 'resourcepacks' },
        shader: { title: 'Shader Browser', icon: Sparkles, ipcPrefix: 'shaderpacks' }
    }[type];

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

    // Load installed items
    useEffect(() => {
        loadInstalledItems();
    }, [instanceId, type]);

    const loadInstalledItems = async () => {
        try {
            const list = await window.ipcRenderer.invoke(`${config.ipcPrefix}:list`, instanceId);
            // Simple heuristic for installed check
            const names = new Set<string>(list.map((m: any) => m.name.toLowerCase()));
            setInstalledItems(names);
        } catch (e) {
            console.error(`Failed to load installed ${type}s`, e);
        }
    };

    const isInstalled = (projectTitle: string) => {
        const titleLower = projectTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const name of installedItems) {
            const nameLower = name.replace(/\.jar$|\.zip$|\.disabled$/i, '').replace(/[^a-z0-9]/g, '');
            if (nameLower.includes(titleLower) || titleLower.includes(nameLower)) {
                return true;
            }
        }
        return false;
    };

    // Check for updates when projects are loaded
    const checkForUpdates = async (projectsList: Project[]) => {
        const updates: { [projectId: string]: { hasUpdate: boolean; currentVersion?: string; currentFilename?: string } } = {};
        
        for (const project of projectsList) {
            try {
                // Get latest version info
                const versions = await window.ipcRenderer.invoke('platform:get-versions', project.project_id, type, { version, loader });
                if (versions.length > 0) {
                    const latestVersion = versions[0];
                    
                    // Check if we have metadata for this project
                    const result = await window.ipcRenderer.invoke('mods:find-by-project', instanceId, type, project.project_id);
                    
                    if (result.found) {
                        const hasUpdate = result.metadata.versionId !== latestVersion.id;
                        updates[project.project_id] = {
                            hasUpdate,
                            currentVersion: result.metadata.versionNumber,
                            currentFilename: result.filename
                        };
                    }
                }
            } catch (e) {
                console.error(`Failed to check updates for ${project.title}:`, e);
            }
        }
        
        setUpdateStatus(updates);
    };

    // Project search
    useEffect(() => {
        searchProjects('');
    }, []);

    // Debounce Search
    useEffect(() => {
        const timer = setTimeout(() => {
            searchProjects(query);
        }, 400);
        return () => clearTimeout(timer);
    }, [query]);

    // Cleanup Progress Listener
    useEffect(() => {
        const handleProgress = (_: any, status: InstallStatus) => {
            if (status.status === 'downloading') {
                setProgress(`Downloading ${status.modName}...`);
                setInstallPercent(prev => Math.min(prev + 20, 80));
            }
            else if (status.status === 'installed') {
                setProgress(`Installed ${status.modName}`);
                setInstallPercent(100);
            }
            else if (status.status === 'failed') showToast(`Failed: ${status.modName}`, 'error');
        };
        window.ipcRenderer.on('platform:install-progress', handleProgress);
        return () => window.ipcRenderer.off('platform:install-progress', handleProgress);
    }, []);

    const searchProjects = async (q: string) => {
        setLoading(true);
        try {
            const res = await window.ipcRenderer.invoke('platform:search', q, type, { version, loader });
            const hits = res.hits || [];
            setProjects(hits);
            
            // Check for updates after loading projects
            if (hits.length > 0) {
                checkForUpdates(hits);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectProject = async (project: Project) => {
        setSelectedProject(project);
        setActiveVersion(null);
        setLoadingVersion(true);
        setDependencyNames({});

        try {
            const versions = await window.ipcRenderer.invoke('platform:get-versions', project.project_id, type, { version, loader });
            if (versions.length > 0) {
                const bestVersion = versions[0];

                // Pre-fetch dependency names
                if (bestVersion.dependencies && bestVersion.dependencies.length > 0) {
                    const idsToFetch = bestVersion.dependencies
                        .filter((d: any) => d.project_id)
                        .map((d: any) => d.project_id);

                    if (idsToFetch.length > 0) {
                        try {
                            const projects = await window.ipcRenderer.invoke('platform:get-projects', idsToFetch);
                            const nameMap: { [key: string]: string } = {};
                            projects.forEach((p: any) => {
                                if (p.id && p.title) nameMap[p.id] = p.title;
                            });
                            setDependencyNames(nameMap);
                        } catch (err) {
                            console.error("Failed to resolve dependency names", err);
                        }
                    }
                }

                setActiveVersion(bestVersion);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingVersion(false);
        }
    };

    const handleInstall = async () => {
        if (!activeVersion || !selectedProject) return;
        setInstalling(true);
        setProgress('Preparing installation...');

        try {
            // If updating, delete the old version first
            const isUpdate = updateStatus[selectedProject.project_id]?.hasUpdate;
            if (isUpdate) {
                const updateInfo = updateStatus[selectedProject.project_id];
                if (updateInfo.currentFilename) {
                    setProgress('Removing old version...');
                    await window.ipcRenderer.invoke(`${config.ipcPrefix}:delete`, instanceId, updateInfo.currentFilename);
                }
            }

            const res = await window.ipcRenderer.invoke('platform:install', instanceId, activeVersion.id, type);
            if (res.success) {
                const action = isUpdate ? 'Updated' : 'Installed';
                showToast(`${action} ${selectedProject?.title}!`, 'success');
                
                // Refresh update status
                if (isUpdate) {
                    setUpdateStatus(prev => ({
                        ...prev,
                        [selectedProject.project_id]: { hasUpdate: false }
                    }));
                }
                
                setSelectedProject(null);
            } else {
                showToast(res.error || 'Install failed', 'error');
            }
        } catch (e: any) {
            showToast(e.message, 'error');
        } finally {
            setInstalling(false);
            setProgress('');
            loadInstalledItems();
        }
    };

    const formatDownloads = (n: number) => {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
        return n.toString();
    };

    const Icon = config.icon;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.titleArea}>
                        <div className={styles.titleWithIcon}>
                            <Icon size={24} className={styles.headerIcon} />
                            <h2>{config.title}</h2>
                        </div>
                        <div className={styles.tags}>
                            {type === 'mod' && <span className={styles.loaderTag}>{loader}</span>}
                            <span className={styles.versionTag}>{version}</span>
                        </div>
                    </div>
                    <button className={styles.closeBtn} onClick={onClose}><X size={20} /></button>
                </div>

                <div className={styles.body}>
                    {!isOnline && (
                        <div style={{
                            position: 'absolute', inset: 0, zIndex: 50,
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', borderRadius: 12, gap: 12
                        }}>
                            <WifiOff size={48} color="#ff8800" strokeWidth={1.5} />
                            <h3 style={{ color: '#fff', margin: 0, fontWeight: 600 }}>No Internet Connection</h3>
                            <p style={{ color: '#71717a', fontSize: 14, margin: 0 }}>Connect to the internet to browse content</p>
                            <button onClick={onClose} style={{
                                marginTop: 8, padding: '8px 20px', background: 'rgba(255,255,255,0.1)',
                                border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
                                color: '#fff', cursor: 'pointer', fontSize: 13
                            }}>Close</button>
                        </div>
                    )}
                    {/* Left Panel - Search & List */}
                    <div className={styles.leftPanel}>
                        <div className={styles.searchWrapper}>
                            <Search size={18} className={styles.searchIcon} />
                            <input
                                className={styles.searchInput}
                                placeholder={`Search ${type}s...`}
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                autoFocus
                            />
                        </div>

                        <div className={styles.modList}>
                            {loading ? (
                                Array.from({ length: 6 }).map((_, i) => (
                                    <div key={i} className={styles.skeletonCard}>
                                        <div className={styles.skeletonIcon} />
                                        <div className={styles.skeletonText}>
                                            <div className={styles.skeletonLine} style={{ width: '70%' }} />
                                            <div className={styles.skeletonLine} style={{ width: '40%' }} />
                                        </div>
                                    </div>
                                ))
                            ) : projects.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <Search size={32} strokeWidth={1.5} />
                                    <p>No results found</p>
                                </div>
                            ) : (
                                projects.map(project => {
                                    const installed = isInstalled(project.title);
                                    const hasUpdate = updateStatus[project.project_id]?.hasUpdate;
                                    return (
                                        <div
                                            key={project.project_id}
                                            className={`${styles.modCard} ${selectedProject?.project_id === project.project_id ? styles.selected : ''} ${installed ? styles.installed : ''} ${hasUpdate ? styles.hasUpdate : ''}`}
                                            onClick={() => handleSelectProject(project)}
                                        >
                                            <img
                                                src={project.icon_url || 'https://cdn.modrinth.com/data/AANobbMI/icon.png'}
                                                alt=""
                                                className={styles.modIcon}
                                            />
                                            <div className={styles.modInfo}>
                                                <div className={styles.modName}>{project.title}</div>
                                                <div className={styles.modAuthor}>by {project.author}</div>
                                            </div>
                                            {installed ? (
                                                hasUpdate ? (
                                                    <div className={styles.updateBadge}>
                                                        <RefreshCw size={14} />
                                                        Update
                                                    </div>
                                                ) : (
                                                    <div className={styles.installedBadge}>
                                                        <CheckCircle size={14} />
                                                        Installed
                                                    </div>
                                                )
                                            ) : (
                                                <div className={styles.modDownloads}>
                                                    <Download size={12} />
                                                    {formatDownloads(project.downloads)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    {/* Right Panel - Details */}
                    <div className={styles.rightPanel}>
                        {selectedProject ? (
                            <div className={styles.detailView}>
                                <div className={styles.detailHeader}>
                                    <img
                                        src={selectedProject.icon_url || 'https://cdn.modrinth.com/data/AANobbMI/icon.png'}
                                        className={styles.detailIcon}
                                    />
                                    <div className={styles.detailMeta}>
                                        <h1>{selectedProject.title}</h1>
                                        <div className={styles.stats}>
                                            <span><Download size={14} /> {formatDownloads(selectedProject.downloads)} downloads</span>
                                        </div>
                                    </div>
                                </div>

                                <div className={`${styles.versionStatus} ${loadingVersion ? styles.loadingStatus : (activeVersion ? (isInstalled(selectedProject.title) ? styles.installedStatus : styles.compatible) : styles.incompatible)}`}>
                                    {loadingVersion ? (
                                        <>
                                            <div className={styles.smallSpinner} />
                                            <span>Checking compatibility...</span>
                                        </>
                                    ) : activeVersion ? (
                                        isInstalled(selectedProject.title) ? (
                                            <>
                                                <CheckCircle size={16} />
                                                <span>Already installed • Version: <strong>{activeVersion.version_number}</strong></span>
                                            </>
                                        ) : (
                                            <>
                                                <Check size={16} />
                                                <span>Compatible version: <strong>{activeVersion.version_number}</strong></span>
                                            </>
                                        )
                                    ) : (
                                        <>
                                            <AlertTriangle size={16} />
                                            <span>No compatible version for {version}</span>
                                        </>
                                    )}
                                </div>

                                <div className={styles.descSection}>
                                    <h3>Description</h3>
                                    <div className={styles.descContent}>
                                        <ReactMarkdown>{selectedProject.description}</ReactMarkdown>
                                    </div>
                                </div>

                                {activeVersion && activeVersion.dependencies && activeVersion.dependencies.length > 0 && (
                                    <div className={styles.depsSection}>
                                        <h3><Package size={14} /> Dependencies ({activeVersion.dependencies.length})</h3>
                                        <div className={styles.depsList}>
                                            {activeVersion.dependencies.map((d: any, i: number) => (
                                                <div
                                                    key={i}
                                                    className={`${styles.depItem} ${d.dependency_type === 'required' ? styles.required : styles.optional}`}
                                                >
                                                    <span className={styles.depType}>
                                                        {d.dependency_type === 'required' ? 'Required' : 'Optional'}
                                                    </span>
                                                    <span className={styles.depId}>
                                                        {d.project_id ? (dependencyNames[d.project_id] || `Project: ${d.project_id.substring(0, 8)}...`) : 'Unknown'}
                                                    </span>
                                                    <span className={styles.depAuto}>Auto-install</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className={styles.installArea}>
                                    {installing ? (
                                        <button className={`${styles.installBtn} ${styles.installingBtn}`} disabled>
                                            <div className={styles.installProgress}>
                                                <span className={styles.installStatus}>{progress || 'Installing...'}</span>
                                                <div className={styles.progressBar}>
                                                    <div className={styles.progressFill} style={{ width: `${installPercent}%` }} />
                                                </div>
                                                <span className={styles.percentText}>{installPercent}%</span>
                                            </div>
                                        </button>
                                    ) : updateStatus[selectedProject.project_id]?.hasUpdate ? (
                                        <button
                                            className={`${styles.installBtn} ${styles.updateBtn}`}
                                            onClick={handleInstall}
                                            disabled={!activeVersion}
                                        >
                                            <RefreshCw size={18} />
                                            <span>Update to {activeVersion?.version_number || 'Latest'}</span>
                                        </button>
                                    ) : isInstalled(selectedProject.title) ? (
                                        <button className={`${styles.installBtn} ${styles.installedBtn}`} disabled>
                                            <CheckCircle size={18} />
                                            <span>Already Installed</span>
                                        </button>
                                    ) : (
                                        <button
                                            className={styles.installBtn}
                                            onClick={handleInstall}
                                            disabled={!activeVersion}
                                        >
                                            <Download size={18} />
                                            <span>Install {type === 'mod' ? 'Mod' : type === 'resourcepack' ? 'Pack' : 'Shader'}</span>
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className={styles.placeholder}>
                                <div className={styles.placeholderIcon}>
                                    <Icon size={48} strokeWidth={1} />
                                </div>
                                <p>Select a {type} to view details</p>
                                <span>Browse and install from Modrinth</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
