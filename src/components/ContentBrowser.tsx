import React, { useState, useEffect, useRef } from 'react';
import styles from './ModBrowser.module.css';
import { 
    Search, Download, Check, AlertTriangle, Package, CheckCircle, X, Sparkles, 
    Layers, WifiOff, RefreshCw, Filter, ChevronRight
} from 'lucide-react';
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
    date_modified?: string;
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
    const [showFilters, setShowFilters] = useState(false);
    const { showToast } = useToast();
    const searchInputRef = useRef<HTMLInputElement>(null);

    const config = {
        mod: { title: 'Mod Browser', icon: Package, subtitle: 'Browse and install mods', ipcPrefix: 'mods' },
        resourcepack: { title: 'Resource Pack Browser', icon: Layers, subtitle: 'Find texture packs', ipcPrefix: 'resourcepacks' },
        shader: { title: 'Shader Browser', icon: Sparkles, subtitle: 'Discover shaders', ipcPrefix: 'shaderpacks' }
    }[type];

    const categories = type === 'mod' 
        ? ['Performance', 'Utility', 'Adventure', 'Magic', 'Tech', 'Decoration', 'Library']
        : type === 'resourcepack'
        ? ['Faithful', 'PvP', 'Low-res', 'HD', 'Fantasy', 'Realistic']
        : ['Performance', 'Cinematic', 'Realistic', 'Fantasy', 'Light'];

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

    // Track installed mods by project ID for accurate matching
    const [installedProjectIds, setInstalledProjectIds] = useState<Set<string>>(new Set());

    const loadInstalledItems = async () => {
        try {
            const list = await window.ipcRenderer.invoke(`${config.ipcPrefix}:list`, instanceId);
            const names = new Set<string>(list.map((m: any) => m.name.toLowerCase()));
            setInstalledItems(names);
            
            // Also check for project IDs in metadata
            const projectIds = new Set<string>();
            for (const item of list) {
                // Check if there's metadata stored for this mod
                try {
                    const result = await window.ipcRenderer.invoke('mods:get-metadata', instanceId, type, item.name);
                    if (result.success && result.metadata?.projectId) {
                        projectIds.add(result.metadata.projectId);
                    }
                } catch (e) {
                    // Ignore errors for items without metadata
                }
            }
            setInstalledProjectIds(projectIds);
        } catch (e) {
            console.error(`Failed to load installed ${type}s`, e);
        }
    };

    const isInstalled = (project: Project) => {
        // First check by project ID (most accurate)
        if (installedProjectIds.has(project.project_id)) {
            return true;
        }
        
        // Fallback to filename matching
        const titleLower = project.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        for (const name of installedItems) {
            const nameLower = name.replace(/\.jar$|\.zip$|\.disabled$/i, '').replace(/[^a-z0-9]/g, '');
            if (nameLower.includes(titleLower) || titleLower.includes(nameLower)) {
                return true;
            }
        }
        return false;
    };

    // Check for updates
    const checkForUpdates = async (projectsList: Project[]) => {
        const updates: { [projectId: string]: { hasUpdate: boolean; currentVersion?: string; currentFilename?: string } } = {};
        
        for (const project of projectsList) {
            try {
                const versions = await window.ipcRenderer.invoke('platform:get-versions', project.project_id, type, { version, loader });
                if (versions.length > 0) {
                    const latestVersion = versions[0];
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
                    <div className={styles.headerLeft}>
                        <button className={styles.backBtn} onClick={onClose}>
                            <X size={20} />
                        </button>
                        <div className={styles.headerTitle}>
                            <Icon size={22} />
                            <div>
                                <h2>{config.title}</h2>
                                <p>{config.subtitle}</p>
                            </div>
                        </div>
                    </div>
                    <div className={styles.headerRight}>
                        <span className={styles.versionTag}>{version}</span>
                        {type === 'mod' && <span className={styles.loaderTag}>{loader}</span>}
                    </div>
                </div>

                {/* Main Content */}
                <div className={styles.body}>
                    {!isOnline && (
                        <div className={styles.offlineOverlay}>
                            <WifiOff size={48} />
                            <h3>No Internet Connection</h3>
                            <p>Connect to the internet to browse content</p>
                            <button onClick={onClose}>Close</button>
                        </div>
                    )}

                    {/* Left Panel - Search & List */}
                    <div className={styles.leftPanel}>
                        {/* Search Bar */}
                        <div className={styles.searchSection}>
                            <div className={styles.searchWrapper}>
                                <Search size={18} />
                                <input
                                    ref={searchInputRef}
                                    placeholder={`Search ${type}s...`}
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    autoFocus
                                />
                                {query && (
                                    <button className={styles.clearSearch} onClick={() => { setQuery(''); searchInputRef.current?.focus(); }}>
                                        <X size={14} />
                                    </button>
                                )}
                            </div>
                            
                            {/* Filters */}
                            <div className={styles.filtersRow}>
                                <button 
                                    className={`${styles.filterBtn} ${showFilters ? styles.active : ''}`}
                                    onClick={() => setShowFilters(!showFilters)}
                                >
                                    <Filter size={14} />
                                    Filter
                                </button>
                                
                                <span className={styles.resultsCount}>
                                    {loading ? 'Searching...' : `${projects.length} results`}
                                </span>
                            </div>

                            {/* Category Filters */}
                            {showFilters && (
                                <div className={styles.categoryFilters}>
                                    {categories.map(cat => (
                                        <button key={cat}>{cat}</button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Project List */}
                        <div className={styles.listView}>
                            {loading ? (
                                Array.from({ length: 8 }).map((_, i) => (
                                    <div key={i} className={styles.skeletonCard}>
                                        <div className={styles.skeletonIcon} />
                                        <div className={styles.skeletonText}>
                                            <div className={styles.skeletonLine} style={{ width: '60%' }} />
                                            <div className={styles.skeletonLine} style={{ width: '40%' }} />
                                        </div>
                                    </div>
                                ))
                            ) : projects.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <Search size={32} />
                                    <p>No results found</p>
                                </div>
                            ) : (
                                projects.map(project => {
                                    const installed = isInstalled(project);
                                    const hasUpdate = updateStatus[project.project_id]?.hasUpdate;
                                    const isSelected = selectedProject?.project_id === project.project_id;
                                    
                                    return (
                                        <div
                                            key={project.project_id}
                                            className={`${styles.modRow} ${isSelected ? styles.selected : ''}`}
                                            onClick={() => handleSelectProject(project)}
                                        >
                                            <img
                                                src={project.icon_url || 'https://cdn.modrinth.com/data/AANobbMI/icon.png'}
                                                alt=""
                                                className={styles.modIcon}
                                            />
                                            <div className={styles.modInfo}>
                                                <div className={styles.modTitleRow}>
                                                    <span className={styles.modName}>{project.title}</span>
                                                    {installed && (
                                                        <span className={`${styles.statusBadge} ${hasUpdate ? styles.update : ''}`}>
                                                            {hasUpdate ? 'Update' : 'Installed'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={styles.modMeta}>
                                                    <span>by {project.author}</span>
                                                    <span className={styles.separator}>|</span>
                                                    <span className={styles.downloads}>
                                                        <Download size={12} />
                                                        {formatDownloads(project.downloads)}
                                                    </span>
                                                </div>
                                            </div>
                                            <ChevronRight size={18} className={styles.arrow} />
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
                                        alt={selectedProject.title}
                                    />
                                    <div className={styles.detailMeta}>
                                        <h1>{selectedProject.title}</h1>
                                        <p>by {selectedProject.author}</p>
                                    </div>
                                </div>

                                <div className={`${styles.versionStatus} ${loadingVersion ? styles.loading : (activeVersion ? (isInstalled(selectedProject) ? styles.installed : styles.compatible) : styles.incompatible)}`}>
                                    {loadingVersion ? (
                                        <>
                                            <RefreshCw size={16} className={styles.spin} />
                                            <span>Checking compatibility...</span>
                                        </>
                                    ) : activeVersion ? (
                                        isInstalled(selectedProject) ? (
                                            <>
                                                <CheckCircle size={16} />
                                                <span>Installed • Version {activeVersion.version_number}</span>
                                            </>
                                        ) : (
                                            <>
                                                <Check size={16} />
                                                <span>Compatible • Version {activeVersion.version_number}</span>
                                            </>
                                        )
                                    ) : (
                                        <>
                                            <AlertTriangle size={16} />
                                            <span>No compatible version</span>
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
                                        <h3>Dependencies ({activeVersion.dependencies.length})</h3>
                                        <div className={styles.depsList}>
                                            {activeVersion.dependencies.map((d: any, i: number) => (
                                                <div key={i} className={styles.depItem}>
                                                    <span className={d.dependency_type === 'required' ? styles.required : styles.optional}>
                                                        {d.dependency_type}
                                                    </span>
                                                    <span>{d.project_id ? (dependencyNames[d.project_id] || d.project_id.substring(0, 8)) : 'Unknown'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className={styles.installArea}>
                                    {installing ? (
                                        <button className={styles.installBtn} disabled>
                                            <div className={styles.progressBar}>
                                                <div className={styles.progressFill} style={{ width: `${installPercent}%` }} />
                                            </div>
                                            <span>{progress}</span>
                                        </button>
                                    ) : updateStatus[selectedProject.project_id]?.hasUpdate ? (
                                        <button className={styles.installBtn} onClick={handleInstall} disabled={!activeVersion}>
                                            <RefreshCw size={18} />
                                            Update
                                        </button>
                                    ) : isInstalled(selectedProject) ? (
                                        <button className={styles.installBtn} disabled>
                                            <CheckCircle size={18} />
                                            Installed
                                        </button>
                                    ) : (
                                        <button className={styles.installBtn} onClick={handleInstall} disabled={!activeVersion}>
                                            <Download size={18} />
                                            Install
                                        </button>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div className={styles.placeholder}>
                                <Icon size={48} />
                                <p>Select a {type} to view details</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
