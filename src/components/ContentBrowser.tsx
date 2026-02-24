import React, { useState, useEffect, useRef } from 'react';
import styles from './ModBrowser.module.css';
import {
    Search, Download, AlertTriangle, Package, CheckCircle, X, Sparkles,
    Layers, RefreshCw, ChevronRight
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { OfflineButton } from './OfflineButton';
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
    slug: string;
    author: string;
    downloads: number;
    categories?: string[];
    date_modified?: string;
}

interface InstallStatus {
    projectId: string;
    modName: string;
    status: 'pending' | 'downloading' | 'installed' | 'skipped' | 'failed';
    progress?: number;
    error?: string;
}

interface UpdateItem {
    projectId: string;
    name: string;
    iconUrl: string;
    currentVersion: string;
    newVersion: string;
    status: 'pending' | 'checking' | 'updating' | 'updated' | 'failed';
    error?: string;
}

export const ContentBrowser: React.FC<ContentBrowserProps> = ({ instanceId, version, loader, type, onClose }) => {
    const [query, setQuery] = useState('');
    const [pageOffset, setPageOffset] = useState(0);
    const [projects, setProjects] = useState<Project[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedProject, setSelectedProject] = useState<Project | null>(null);
    const [activeVersion, setActiveVersion] = useState<any | null>(null);
    const [downloadingProjects, setDownloadingProjects] = useState<{ [projectId: string]: { status: string, progress: number, name: string } }>({});
    const [installedItems, setInstalledItems] = useState<Set<string>>(new Set());
    const [installedProjectIds, setInstalledProjectIds] = useState<Set<string>>(new Set());
    const [loadingVersion, setLoadingVersion] = useState(false);
    const [dependencyNames, setDependencyNames] = useState<{ [key: string]: string }>({});
    const [updateStatus, setUpdateStatus] = useState<{ [projectId: string]: { hasUpdate: boolean; currentVersion?: string; currentFilename?: string } }>({});
    const [confirmInstall, setConfirmInstall] = useState(false);
    const [installDetails, setInstallDetails] = useState<{ project: Project, version: any, size: number, missingDeps: string[] } | null>(null);
    const [showUpdateModal, setShowUpdateModal] = useState(false);
    const [updateItems, setUpdateItems] = useState<UpdateItem[]>([]);

    const [activeCategory, setActiveCategory] = useState<string>('All');

    const { showToast } = useToast();
    const searchInputRef = useRef<HTMLInputElement>(null);

    const config = {
        mod: { title: 'Mods Browser', icon: Package, subtitle: 'Enhance your experience', ipcPrefix: 'mods' },
        resourcepack: { title: 'Resource Packs', icon: Layers, subtitle: 'Customize the visuals', ipcPrefix: 'resourcepacks' },
        shader: { title: 'Shader Packs', icon: Sparkles, subtitle: 'Beautiful lighting', ipcPrefix: 'shaderpacks' }
    }[type];

    const categories = ['All', ...(type === 'mod'
        ? ['Performance', 'Utility', 'Adventure', 'Magic', 'Tech', 'Decoration', 'Library']
        : type === 'resourcepack'
            ? ['Faithful', 'PvP', 'Low-res', 'HD', 'Fantasy', 'Realistic']
            : ['Performance', 'Cinematic', 'Realistic', 'Fantasy', 'Light'])];

    useEffect(() => {
        loadInstalledItems();
    }, [instanceId, type]);

    const loadInstalledItems = async () => {
        try {
            const list = await window.ipcRenderer.invoke(`${config.ipcPrefix}:list`, instanceId);
            const names = new Set<string>(list.map((m: any) => m.name.toLowerCase()));
            setInstalledItems(names);

            const projectIds = new Set<string>();
            for (const item of list) {
                try {
                    const result = await window.ipcRenderer.invoke('mods:get-metadata', instanceId, type, item.name);
                    if (result.success && result.metadata?.projectId) {
                        projectIds.add(result.metadata.projectId);
                    }
                } catch (e) { /* ignore */ }
            }
            setInstalledProjectIds(projectIds);
        } catch (e) {
            console.error(`Failed to load installed ${type}s`, e);
        }
    };

    const isInstalled = (project: Project) => {
        if (installedProjectIds.has(project.project_id)) return true;
        const projectSlugLower = project.slug.toLowerCase().replace(/[^a-z0-9-]/g, '');
        for (const name of installedItems) {
            const nameLower = name.replace(/\.jar$|\.zip$|\.disabled$/i, '').toLowerCase().replace(/[^a-z0-9-]/g, '');
            if (nameLower === projectSlugLower || nameLower.startsWith(`${projectSlugLower}-`)) {
                return true;
            }
        }
        return false;
    };

    const checkForUpdates = async (projectsList: Project[]) => {
        const updates: typeof updateStatus = {};
        for (const project of projectsList) {
            try {
                if (isInstalled(project)) {
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
                }
            } catch (e) { console.error(e); }
        }
        setUpdateStatus(prev => ({ ...prev, ...updates }));
    };

    useEffect(() => {
        setPageOffset(0);
        setProjects([]);
        searchProjects('', 0);
    }, []);

    useEffect(() => {
        const timer = setTimeout(() => {
            setPageOffset(0);
            setProjects([]);
            searchProjects(query, 0);
        }, 400);
        return () => clearTimeout(timer);
    }, [query, activeCategory]);

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const target = e.target as HTMLDivElement;
        if (target.scrollHeight - target.scrollTop - target.clientHeight < 100) {
            if (!loading) {
                const newOffset = pageOffset + 50;
                setPageOffset(newOffset);
                searchProjects(query, newOffset);
            }
        }
    };

    useEffect(() => {
        const handleProgress = (_: any, status: InstallStatus) => {
            if (!status.projectId) return;

            setDownloadingProjects(prev => {
                const updated = { ...prev };
                if (status.status === 'downloading') {
                    updated[status.projectId] = {
                        status: `Downloading...`,
                        progress: status.progress || 0,
                        name: status.modName
                    };
                }
                else if (status.status === 'installed') {
                    updated[status.projectId] = { status: `Installed`, progress: 100, name: status.modName };
                    setInstalledProjectIds(prevIds => new Set(prevIds).add(status.projectId));
                }
                else if (status.status === 'failed') {
                    delete updated[status.projectId];
                    showToast(`Failed: ${status.modName}`, 'error');
                }
                else if (status.status === 'skipped') {
                    setInstalledProjectIds(prevIds => new Set(prevIds).add(status.projectId));
                    delete updated[status.projectId];
                }
                return updated;
            });
        };
        window.ipcRenderer.on('platform:install-progress', handleProgress);
        return () => window.ipcRenderer.off('platform:install-progress', handleProgress);
    }, []);

    const searchProjects = async (q: string, offset: number = 0) => {
        setLoading(true);
        try {
            const cat = activeCategory === 'All' ? undefined : activeCategory.toLowerCase();
            const searchOptions = { version, loader, offset, limit: 50 };
            if (cat) (searchOptions as any).category = cat;
            
            const res = await window.ipcRenderer.invoke('platform:search', q, type, searchOptions);
            let hits = res.hits || [];

            setProjects(offset === 0 ? hits : [...projects, ...hits]);

            if (hits.length > 0) {
                checkForUpdates(hits);
            }
        } catch (e) { console.error(e); } finally { setLoading(false); }
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
                if (bestVersion.dependencies?.length > 0) {
                    const idsToFetch = bestVersion.dependencies.filter((d: any) => d.project_id).map((d: any) => d.project_id);
                    if (idsToFetch.length > 0) {
                        try {
                            const pData = await window.ipcRenderer.invoke('platform:get-projects', idsToFetch);
                            const nameMap: { [key: string]: string } = {};
                            pData.forEach((p: any) => { if (p.id) nameMap[p.id] = p.title; });
                            setDependencyNames(nameMap);
                        } catch (err) { }
                    }
                }
                setActiveVersion(bestVersion);
            }
        } catch (e) { console.error(e); } finally { setLoadingVersion(false); }
    };

    const handleQuickInstall = async (e: React.MouseEvent, project: Project) => {
        e.stopPropagation();
        if (downloadingProjects[project.project_id] || isInstalled(project)) return;

        try {
            const versions = await window.ipcRenderer.invoke('platform:get-versions', project.project_id, type, { version, loader });
            if (versions.length > 0) {
                const bestVer = versions[0];
                executeInstall(project, bestVer);
            } else {
                showToast(`No compatible version found for ${version}`, 'error');
            }
        } catch (err) {
            showToast('Failed to start installation', 'error');
        }
    };

    const openUpdateModal = async () => {
        setShowUpdateModal(true);
        setUpdateItems([]);
        
        const updatableProjectIds = Object.keys(updateStatus).filter(pid => updateStatus[pid].hasUpdate);
        
        if (updatableProjectIds.length === 0) {
            showToast('All installed mods are up to date.', 'success');
            return;
        }

        const items: UpdateItem[] = [];
        
        for (const pid of updatableProjectIds) {
            const status = updateStatus[pid];
            const project = projects.find(p => p.project_id === pid);
            
            if (project) {
                items.push({
                    projectId: pid,
                    name: project.title,
                    iconUrl: project.icon_url || '',
                    currentVersion: status.currentVersion || 'Unknown',
                    newVersion: 'Latest',
                    status: 'checking'
                });
            }
        }
        
        setUpdateItems(items);
        
        for (const item of items) {
            await checkAndUpdateSingle(item.projectId);
        }
    };

    const checkAndUpdateSingle = async (projectId: string) => {
        setUpdateItems(prev => prev.map(item => 
            item.projectId === projectId ? { ...item, status: 'checking' } : item
        ));

        try {
            const versions = await window.ipcRenderer.invoke('platform:get-versions', projectId, type, { version, loader });
            if (versions.length > 0) {
                const latestVersion = versions[0];
                
                setUpdateItems(prev => prev.map(item => 
                    item.projectId === projectId ? { ...item, newVersion: latestVersion.version_number, status: 'pending' } : item
                ));
            }
        } catch (e) {
            setUpdateItems(prev => prev.map(item => 
                item.projectId === projectId ? { ...item, status: 'failed', error: 'Failed to check' } : item
            ));
        }
    };

    const handleUpdateAll = async () => {
        const pendingItems = updateItems.filter(item => item.status === 'pending');
        
        if (pendingItems.length === 0) {
            showToast('No updates available.', 'info');
            return;
        }

        for (const item of pendingItems) {
            await performUpdate(item.projectId);
        }
    };

    const performUpdate = async (projectId: string) => {
        setUpdateItems(prev => prev.map(item => 
            item.projectId === projectId ? { ...item, status: 'updating' } : item
        ));

        try {
            const versions = await window.ipcRenderer.invoke('platform:get-versions', projectId, type, { version, loader });
            if (versions.length > 0) {
                const bestVer = versions[0];
                
                const project = projects.find(p => p.project_id === projectId);
                if (project) {
                    await executeInstall(project, bestVer);
                    
                    setUpdateItems(prev => prev.map(item => 
                        item.projectId === projectId ? { ...item, status: 'updated' } : item
                    ));
                    
                    setUpdateStatus(prev => ({ ...prev, [projectId]: { hasUpdate: false } }));
                }
            }
        } catch (e: any) {
            setUpdateItems(prev => prev.map(item => 
                item.projectId === projectId ? { ...item, status: 'failed', error: e.message || 'Update failed' } : item
            ));
        }
    };

    const handleDetailInstall = async () => {
        if (!activeVersion || !selectedProject) return;

        const requiredDeps = activeVersion.dependencies?.filter((d: any) => d.dependency_type === 'required' && d.project_id && !installedProjectIds.has(d.project_id)) || [];
        await executeInstallWithDeps(selectedProject, activeVersion, requiredDeps);
    };

    const executeInstallWithDeps = async (project: Project, ver: any, requiredDeps: any[] = []) => {
        const pid = project.project_id;
        setConfirmInstall(false);

        if (requiredDeps.length > 0) {
            showToast(`Installing ${project.title} ${requiredDeps.length > 0 ? `and ${requiredDeps.length} ${requiredDeps.length === 1 ? 'dependency' : 'dependencies'}` : ''}...`, 'info');
        } else {
            setDownloadingProjects(prev => ({ ...prev, [pid]: { status: 'Preparing...', progress: 0, name: project.title } }));
        }

        try {
            const isUpdate = updateStatus[pid]?.hasUpdate;
            if (isUpdate && updateStatus[pid].currentFilename) {
                await window.ipcRenderer.invoke(`${config.ipcPrefix}:delete`, instanceId, updateStatus[pid].currentFilename);
            }

            for (const dep of requiredDeps) {
                try {
                    const depVersions = await window.ipcRenderer.invoke('platform:get-versions', dep.project_id, type, { version, loader });
                    if (depVersions.length > 0) {
                        await window.ipcRenderer.invoke('platform:install', instanceId, depVersions[0].id, type);
                    }
                } catch (e: any) {
                    console.error('Failed to install dependency:', dep.project_id, e);
                }
            }

            const res = await window.ipcRenderer.invoke('platform:install', instanceId, ver.id, type);
            if (res.success) {
                showToast(`${isUpdate ? 'Updated' : 'Installed'} ${project.title}!`, 'success');
                if (isUpdate) setUpdateStatus(prev => ({ ...prev, [pid]: { hasUpdate: false } }));
                setSelectedProject(null);
            } else {
                showToast(res.error || 'Install failed', 'error');
                setDownloadingProjects(prev => { const upd = { ...prev }; delete upd[pid]; return upd; });
            }
        } catch (e: any) {
            showToast(e.message, 'error');
            setDownloadingProjects(prev => { const upd = { ...prev }; delete upd[pid]; return upd; });
        } finally {
            setTimeout(() => {
                setDownloadingProjects(prev => {
                    const upd = { ...prev };
                    if (upd[pid] && upd[pid].progress >= 100) delete upd[pid];
                    return upd;
                });
                loadInstalledItems();
            }, 1000);
        }
    };

    const executeInstall = async (project: Project, ver: any) => {
        await executeInstallWithDeps(project, ver);
    };

    const formatDownloads = (n: number) => n >= 1000000 ? (n / 1000000).toFixed(1) + 'M' : n >= 1000 ? (n / 1000).toFixed(0) + 'K' : n.toString();
    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + ['B', 'KB', 'MB', 'GB'][i];
    };

    const Icon = config.icon;
    const updateCount = Object.values(updateStatus).filter(s => s.hasUpdate).length;

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <button className={styles.backBtn} onClick={onClose}><X size={20} /></button>
                        <div className={styles.headerTitle}>
                            <Icon size={24} />
                            <div>
                                <h2>{config.title}</h2>
                                <p>{config.subtitle}</p>
                            </div>
                        </div>
                    </div>
                    <div className={styles.headerCenter}>
                        <div className={styles.searchWrapper}>
                            <Search size={18} />
                            <input
                                ref={searchInputRef}
                                placeholder={`Search ${type}s by name or author...`}
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
                    </div>
                    <div className={styles.headerRight}>
                        {updateCount > 0 && (
                            <button className={styles.updateAllBtn} onClick={openUpdateModal}>
                                <RefreshCw size={14} /> Updates
                                <span className={styles.updateCount}>{updateCount}</span>
                            </button>
                        )}
                        <span className={styles.versionTag}>{version}</span>
                        {type === 'mod' && <span className={styles.loaderTag}>{loader}</span>}
                    </div>
                </div>

                <div className={styles.body}>
                    <div className={styles.sidebar}>
                        <div className={styles.sidebarSection}>
                            <span className={styles.sidebarTitle}>Categories</span>
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    className={`${styles.categoryBtn} ${activeCategory === cat ? styles.active : ''}`}
                                    onClick={() => setActiveCategory(cat)}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className={styles.mainContent}>
                        <div className={styles.contentHeader}>
                            <h3>Discover {type}s</h3>
                            <span className={styles.resultsCount}>
                                {loading ? 'Searching...' : `${projects.length} results`}
                            </span>
                        </div>

                        <div className={styles.gridScroller} onScroll={handleScroll}>
                            {projects.length === 0 && loading ? (
                                <div className={styles.modGrid}>
                                    {Array.from({ length: 12 }).map((_, i) => (
                                        <div key={i} className={styles.skeletonCard}>
                                            <div style={{ display: 'flex', gap: '16px' }}>
                                                <div className={styles.skeletonIcon} />
                                                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                    <div className={styles.skeletonText} style={{ width: '70%' }} />
                                                    <div className={styles.skeletonText} style={{ width: '40%' }} />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : projects.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <Search size={48} />
                                    <p>No results found for "{query}"</p>
                                </div>
                            ) : (
                                <>
                                    <div className={styles.modGrid}>
                                        {projects.map(project => {
                                            const installed = isInstalled(project);
                                            const downInfo = downloadingProjects[project.project_id];
                                            const hasUpdate = updateStatus[project.project_id]?.hasUpdate;

                                            return (
                                                <div 
                                                    key={project.project_id} 
                                                    className={styles.modCard}
                                                    onClick={() => handleSelectProject(project)}
                                                >
                                                    {downInfo && (
                                                        <div className={styles.cardProgressOverlay} style={{ width: `${downInfo.progress}%` }} />
                                                    )}

                                                    <div className={styles.modCardTop}>
                                                        <img src={project.icon_url || 'https://cdn.modrinth.com/data/AANobbMI/icon.png'} className={styles.modIcon} alt="" />
                                                        <div className={styles.modInfo}>
                                                            <div className={styles.modTitleRow}>
                                                                <h4 className={styles.modName} title={project.title}>{project.title}</h4>
                                                            </div>
                                                            <span className={styles.modAuthor}>by {project.author}</span>
                                                        </div>
                                                    </div>

                                                    <p className={styles.modDesc}>{project.description}</p>

                                                    <div className={styles.modCardBottom}>
                                                        <div className={styles.modStats}>
                                                            <div className={styles.statBadge}>
                                                                <Download size={14} /> {formatDownloads(project.downloads)}
                                                            </div>
                                                        </div>

                                                        {downInfo ? (
                                                            <button className={`${styles.actionBtn} ${styles.btnDownloading}`} onClick={e => e.stopPropagation()}>
                                                                <div className={styles.progressFill} style={{ width: `${downInfo.progress}%` }} />
                                                                <span className={styles.progressText}>{downInfo.progress}%</span>
                                                            </button>
                                                        ) : hasUpdate ? (
                                                            <button 
                                                                className={`${styles.actionBtn} ${styles.btnUpdate}`}
                                                                onClick={e => { e.stopPropagation(); openUpdateModal(); }}
                                                            >
                                                                <RefreshCw size={14} /> Update
                                                            </button>
                                                        ) : installed ? (
                                                            <button
                                                                className={`${styles.actionBtn} ${styles.btnInstalled}`}
                                                                onClick={e => e.stopPropagation()}
                                                            >
                                                                <CheckCircle size={14} /> Installed
                                                            </button>
                                                        ) : (
                                                            <OfflineButton
                                                                className={`${styles.actionBtn} ${styles.btnInstall}`}
                                                                onClick={(e: any) => handleQuickInstall(e, project)}
                                                                offlineDisabled={true}
                                                                offlineTooltip="Internet required"
                                                            >
                                                                <Download size={14} /> Install
                                                            </OfflineButton>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    {loading && projects.length > 0 && (
                                        <div style={{ textAlign: 'center', padding: '20px', color: '#888' }}>
                                            Loading more...
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {selectedProject && (
                <div className={styles.detailOverlay} onClick={() => setSelectedProject(null)}>
                    <div className={styles.detailPanel} onClick={e => e.stopPropagation()}>
                        <button className={styles.closeDetail} onClick={() => setSelectedProject(null)}><X size={24} /></button>

                        <div className={styles.detailHeader}>
                            <img src={selectedProject.icon_url || 'https://cdn.modrinth.com/data/AANobbMI/icon.png'} className={styles.detailIcon} alt="" />
                            <div className={styles.detailMeta}>
                                <h2>{selectedProject.title}</h2>
                                <p>by {selectedProject.author} • {formatDownloads(selectedProject.downloads)} downloads</p>
                            </div>
                        </div>

                        <div className={styles.detailBody}>
                            <div className={`${styles.versionStatus} ${loadingVersion ? styles.loading : (activeVersion ? (isInstalled(selectedProject) ? styles.installed : styles.compatible) : styles.incompatible)}`}>
                                {loadingVersion ? <><RefreshCw size={16} className={styles.spin} /> <span>Checking compatibility...</span></>
                                    : activeVersion ? <><CheckCircle size={16} /> <span>Version {activeVersion.version_number} compatible</span></>
                                        : <><AlertTriangle size={16} /> <span>No compatible version</span></>}
                            </div>

                            <div className={styles.markdownContent}>
                                <ReactMarkdown>{selectedProject.description}</ReactMarkdown>
                            </div>

                            {activeVersion?.dependencies?.length > 0 && (
                                <div className={styles.depsSection}>
                                    <h3>Dependencies ({activeVersion.dependencies.length})</h3>
                                    <div className={styles.depsList}>
                                        {activeVersion.dependencies.map((d: any, i: number) => (
                                            <div key={i} className={styles.depItem}>
                                                <span className={d.dependency_type === 'required' ? styles.required : styles.optional}>{d.dependency_type}</span>
                                                <span>{d.project_id ? (dependencyNames[d.project_id] || d.project_id.substring(0, 8)) : 'Unknown'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className={styles.detailFooter}>
                            {downloadingProjects[selectedProject.project_id] ? (
                                <button className={`${styles.actionBtn} ${styles.btnDownloading} ${styles.detailInstallBtn}`} style={{ width: '100%' }} disabled>
                                    <div className={styles.progressFill} style={{ width: `${downloadingProjects[selectedProject.project_id].progress}%` }} />
                                    <span className={styles.progressText}>{downloadingProjects[selectedProject.project_id].status} {downloadingProjects[selectedProject.project_id].progress}%</span>
                                </button>
                            ) : isInstalled(selectedProject) ? (
                                <button className={`${styles.actionBtn} ${styles.btnInstalled} ${styles.detailInstallBtn}`} style={{ width: '100%' }} disabled>
                                    <CheckCircle size={18} /> Installed
                                </button>
                            ) : (
                                <OfflineButton className={`${styles.actionBtn} ${styles.btnInstall} ${styles.detailInstallBtn}`} onClick={handleDetailInstall} disabled={!activeVersion} offlineDisabled={true}>
                                    <Download size={18} /> Install
                                </OfflineButton>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {confirmInstall && installDetails && (
                <div className={styles.confirmOverlay} onClick={() => setConfirmInstall(false)}>
                    <div className={styles.confirmModal} onClick={e => e.stopPropagation()}>
                        <h3>Confirm Installation</h3>
                        <p><strong>{installDetails.project.title}</strong> ({formatBytes(installDetails.size)})</p>
                        {installDetails.missingDeps.length > 0 && (
                            <div className={styles.missingDeps}>
                                <p>Requires additional dependencies:</p>
                                <ul>{installDetails.missingDeps.map((dep, i) => <li key={i}>{dep}</li>)}</ul>
                            </div>
                        )}
                        <div className={styles.confirmActions}>
                            <button onClick={() => setConfirmInstall(false)}>Cancel</button>
                            <button onClick={() => executeInstall(installDetails.project, installDetails.version)}>Install All</button>
                        </div>
                    </div>
                </div>
            )}

            {showUpdateModal && (
                <div className={styles.updateOverlay} onClick={() => setShowUpdateModal(false)}>
                    <div className={styles.updateModal} onClick={e => e.stopPropagation()}>
                        <div className={styles.updateModalHeader}>
                            <h2><RefreshCw size={20} /> Check Updates</h2>
                            <button className={styles.updateModalClose} onClick={() => setShowUpdateModal(false)}>
                                <X size={20} />
                            </button>
                        </div>
                        
                        <div className={styles.updateModalBody}>
                            {updateItems.length === 0 ? (
                                <div className={styles.updateEmpty}>
                                    <CheckCircle size={48} />
                                    <h3>All up to date!</h3>
                                    <p>No updates available for your installed {type}s.</p>
                                </div>
                            ) : (
                                updateItems.map(item => (
                                    <div key={item.projectId} className={styles.updateItem}>
                                        <div className={styles.updateItemIcon}>
                                            {item.iconUrl ? (
                                                <img src={item.iconUrl} alt="" />
                                            ) : (
                                                <Package size={24} />
                                            )}
                                        </div>
                                        <div className={styles.updateItemInfo}>
                                            <div className={styles.updateItemName}>{item.name}</div>
                                            <div className={styles.updateItemVersions}>
                                                <span>v{item.currentVersion}</span>
                                                <ChevronRight size={12} />
                                                <span>v{item.newVersion}</span>
                                            </div>
                                        </div>
                                        <div className={styles.updateItemStatus}>
                                            {item.status === 'checking' && (
                                                <div className={`${styles.updateStatusIcon} ${styles.checking}`}>
                                                    <RefreshCw size={16} className={styles.spin} />
                                                </div>
                                            )}
                                            {item.status === 'updating' && (
                                                <div className={`${styles.updateStatusIcon} ${styles.updating}`}>
                                                    <RefreshCw size={16} className={styles.spin} />
                                                </div>
                                            )}
                                            {item.status === 'updated' && (
                                                <div className={`${styles.updateStatusIcon} ${styles.updated}`}>
                                                    <CheckCircle size={16} />
                                                </div>
                                            )}
                                            {item.status === 'failed' && (
                                                <div className={`${styles.updateStatusIcon} ${styles.failed}`}>
                                                    <AlertTriangle size={16} />
                                                </div>
                                            )}
                                            {item.status === 'pending' && (
                                                <button 
                                                    className={`${styles.actionBtn} ${styles.btnUpdate}`}
                                                    onClick={() => performUpdate(item.projectId)}
                                                >
                                                    <Download size={14} /> Update
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        <div className={styles.updateModalFooter}>
                            <div className={styles.updateSummary}>
                                {updateItems.length > 0 && (
                                    <><strong>{updateItems.filter(i => i.status === 'updated').length}</strong> of <strong>{updateItems.length}</strong> updated</>
                                )}
                            </div>
                            <div className={styles.updateActions}>
                                <button className={styles.cancelBtn} onClick={() => setShowUpdateModal(false)}>Close</button>
                                {updateItems.some(i => i.status === 'pending') && (
                                    <button className={styles.updateBtn} onClick={handleUpdateAll}>
                                        <RefreshCw size={16} /> Update All
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
