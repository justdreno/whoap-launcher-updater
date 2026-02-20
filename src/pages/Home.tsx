import React, { useState, useEffect, useRef } from 'react';
import styles from './Home.module.css';
import { InstanceApi, Instance } from '../api/instances';
import { LaunchApi } from '../api/launch';
import { NetworkApi, ServerStatus } from '../api/network';
import {
    Rocket,
    Clock,
    Layers,
    Star,
    Globe,
    Wifi,
    Users,
    Copy,
    Check,
    ChevronRight,
    ChevronDown,
    Box,
    Server,
    FolderOpen,
    Search,
    X
} from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { SkinViewer3D } from '../components/SkinViewer3D';
import { CreateInstanceModal } from '../components/CreateInstanceModal';
import { ServerService, FeaturedServer } from '../services/ServerService';
import { PageHeader } from '../components/PageHeader';
import { SyncQueue } from '../utils/SyncQueue';

interface HomeProps {
    user: {
        name: string;
        uuid: string;
        token: string;
    };
    setUser?: (user: any) => void;
    onNavigate?: (tab: string, instanceId?: string) => void;
    onLockNav?: (locked: boolean) => void;
}

export const Home: React.FC<HomeProps> = ({ user, setUser, onNavigate, onLockNav }) => {
    const [instances, setInstances] = useState<Instance[]>([]);
    const [selectedInstance, setSelectedInstance] = useState<Instance | null>(null);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showSkinModal, setShowSkinModal] = useState(false);
    const [showInstanceDropdown, setShowInstanceDropdown] = useState(false);
    const [tempSkin, setTempSkin] = useState((user as any).preferredSkin || user.name);
    const [lastUpdated, setLastUpdated] = useState(Date.now());
    const [searchQuery, setSearchQuery] = useState('');
    const { showToast } = useToast();
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Launch State
    const [isLaunching, setIsLaunching] = useState(false);
    const [launchStatus, setLaunchStatus] = useState('');
    const [launchProgress, setLaunchProgress] = useState(0);
    const [downloadStats, setDownloadStats] = useState<{
        currentBytes: number;
        totalBytes: number;
        speed: number; // bytes per second
        eta: number; // seconds
    } | null>(null);

    // Server Status
    const [serverIp, setServerIp] = useState('');
    const [serverStatus, setServerStatus] = useState<ServerStatus | null>(null);
    const [statusLoading, setStatusLoading] = useState(false);

    // Featured Servers
    const [featuredServers, setFeaturedServers] = useState<FeaturedServer[]>([]);
    const [featuredStatuses, setFeaturedStatuses] = useState<Record<string, ServerStatus>>({});
    const [copiedId, setCopiedId] = useState<string | null>(null);

    useEffect(() => {
        loadData();

        const handleProgress = (_event: any, data: any) => {
            setLaunchStatus(data.status);
            if (data.total > 0) {
                setLaunchProgress((data.progress / data.total) * 100);
            }

            // Track download stats for display
            if (data.totalBytes > 0) {
                setDownloadStats(prev => {
                    const currentBytes = data.currentBytes || data.progress;
                    const totalBytes = data.totalBytes || data.total;

                    // Calculate speed
                    let speed = 0;
                    if (prev && data.timestamp) {
                        const timeDelta = (data.timestamp - (prev as any).lastTimestamp) / 1000;
                        const bytesDelta = currentBytes - prev.currentBytes;
                        if (timeDelta > 0) {
                            speed = bytesDelta / timeDelta;
                        }
                    }

                    // Calculate ETA
                    let eta = 0;
                    if (speed > 0) {
                        const remainingBytes = totalBytes - currentBytes;
                        eta = Math.max(0, Math.round(remainingBytes / speed));
                    }

                    return {
                        currentBytes,
                        totalBytes,
                        speed,
                        eta,
                        lastTimestamp: data.timestamp || Date.now()
                    } as any;
                });
            }
        };
        window.ipcRenderer.on('launch:progress', handleProgress);

        return () => {
            // Cleanup handled by component unmount
        };
    }, []);

    useEffect(() => {
        onLockNav?.(isLaunching);
    }, [isLaunching, onLockNav]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowInstanceDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadData = async () => {
        const list = await InstanceApi.list();
        setInstances(list);

        if (list.length > 0 && !selectedInstance) {
            const mostRecent = [...list].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))[0];
            setSelectedInstance(mostRecent);
        }

        const servers = await ServerService.getFeaturedServers();
        setFeaturedServers(servers);

        servers.forEach(async (server) => {
            try {
                const status = await NetworkApi.getServerStatus(server.address);
                setFeaturedStatuses(prev => ({ ...prev, [server.id]: status }));
            } catch (e) {
                // Ignore errors
            }
        });
    };

    const handleLaunch = async () => {
        if (!selectedInstance || isLaunching) return;

        setIsLaunching(true);
        setLaunchStatus('Preparing...');
        setLaunchProgress(0);

        try {
            const result = await LaunchApi.launch(selectedInstance, user);
            if (!result.success) {
                showToast(`Launch failed: ${result.error}`, 'error');
                setIsLaunching(false);
            } else {
                await InstanceApi.updateLastPlayed(selectedInstance.id);
                const list = await InstanceApi.list();
                setInstances(list);
                setLaunchStatus('Running...');
                setTimeout(() => setIsLaunching(false), 3000);
            }
        } catch (e) {
            setIsLaunching(false);
            showToast('Launch error', 'error');
        }
    };

    const handleCheckStatus = async () => {
        if (!serverIp.trim()) return;
        setStatusLoading(true);
        try {
            const status = await NetworkApi.getServerStatus(serverIp.trim());
            setServerStatus(status);
        } catch (e) {
            showToast('Failed to check server', 'error');
        } finally {
            setStatusLoading(false);
        }
    };

    const handleCopyIp = (ip: string, id: string) => {
        navigator.clipboard.writeText(ip);
        setCopiedId(id);
        showToast('IP copied!', 'success');
        setTimeout(() => setCopiedId(null), 2000);
    };

    const formatEta = (seconds: number): string => {
        if (seconds < 60) return `${seconds}s`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
        return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    };

    const handleToggleFavorite = async (e: React.MouseEvent, inst: Instance) => {
        e.stopPropagation();
        await InstanceApi.toggleFavorite(inst.id);
        const list = await InstanceApi.list();
        setInstances(list);
    };

    const handleCreated = async (instance?: Instance) => {
        const list = await InstanceApi.list();
        setInstances(list);
        if (list.length > 0) {
            setSelectedInstance(list[0]);
        }
        setShowCreateModal(false);

        // Queue cloud sync if user is logged in
        if (instance && (user as any)?.type === 'yashin' && (user as any)?.uuid) {
            SyncQueue.enqueue('instance:create', {
                instance,
                userId: (user as any).uuid,
                token: (user as any).token
            });
            console.log('[Home] Queued instance for cloud sync:', instance.name);
        }
    };

    const handleSelectInstance = (inst: Instance) => {
        setSelectedInstance(inst);
        setShowInstanceDropdown(false);
        setSearchQuery('');
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good morning';
        if (hour < 18) return 'Good afternoon';
        return 'Good evening';
    };

    const formatDate = (timestamp: number) => {
        if (!timestamp) return 'Never';
        const date = new Date(timestamp);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    const formatPlayTime = (seconds?: number) => {
        if (!seconds || seconds === 0) return '0h 0m';
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        return `${hours}h ${minutes}m`;
    };

    const filteredInstances = instances.filter(inst =>
        inst.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        inst.version.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const recentInstances = [...instances]
        .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
        .slice(0, 4);

    return (
        <div className={styles.container}>
            <PageHeader
                title="Home"
                description={`${getGreeting()}, ${user.name}. Ready to play?`}
            />

            {/* Hero Section */}
            <div className={styles.hero}>
                <div className={styles.heroContent}>
                    <div className={styles.greeting}>Welcome back</div>
                    <div className={styles.username}>{user.name}</div>

                    {/* Instance Selector with Flip Animation */}
                    <div className={styles.instanceSelector} ref={dropdownRef}>
                        <div className={styles.selectorWrapper}>
                            {/* Selected Profile Card */}
                            <div
                                className={`${styles.selectedProfile} ${showInstanceDropdown ? styles.hidden : ''}`}
                                onClick={() => instances.length > 0 && setShowInstanceDropdown(true)}
                            >
                                <div className={styles.profileLabel}>Selected Profile</div>
                                <div className={styles.profileRow}>
                                    {selectedInstance ? (
                                        <>
                                            <div className={styles.profileInfo}>
                                                <div className={styles.profileName}>{selectedInstance.name}</div>
                                                <div className={styles.profileMeta}>
                                                    <span className={styles.profileLoader}>{selectedInstance.loader}</span>
                                                    <span>{selectedInstance.version}</span>
                                                    <span>•</span>
                                                    <span>{formatPlayTime(selectedInstance.playTime)}</span>
                                                </div>
                                            </div>
                                            <ChevronDown size={18} className={styles.chevron} />
                                        </>
                                    ) : (
                                        <div className={styles.noProfileSelected}>
                                            <span>No profile selected</span>
                                            <ChevronDown size={18} />
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Dropdown Menu - Replaces the card */}
                            <div className={`${styles.dropdown} ${showInstanceDropdown ? styles.visible : ''}`}>
                                <div className={styles.dropdownHeader}>
                                    <span>Select Profile</span>
                                    <button
                                        className={styles.closeDropdownBtn}
                                        onClick={() => setShowInstanceDropdown(false)}
                                    >
                                        <ChevronDown size={18} style={{ transform: 'rotate(180deg)' }} />
                                    </button>
                                </div>

                                {/* Search */}
                                <div className={styles.dropdownSearch}>
                                    <Search size={14} />
                                    <input
                                        type="text"
                                        placeholder="Search profiles..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        autoFocus={showInstanceDropdown}
                                    />
                                    {searchQuery && (
                                        <button onClick={() => setSearchQuery('')}>
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>

                                {/* Instance List */}
                                <div className={styles.dropdownList}>
                                    {filteredInstances.length === 0 ? (
                                        <div className={styles.dropdownEmpty}>No profiles found</div>
                                    ) : (
                                        filteredInstances.map(inst => (
                                            <div
                                                key={inst.id}
                                                className={`${styles.dropdownItem} ${selectedInstance?.id === inst.id ? styles.active : ''}`}
                                                onClick={() => handleSelectInstance(inst)}
                                            >
                                                <div className={styles.dropdownIcon}>
                                                    {inst.name.charAt(0).toUpperCase()}
                                                </div>
                                                <div className={styles.dropdownInfo}>
                                                    <div className={styles.dropdownName}>{inst.name}</div>
                                                    <div className={styles.dropdownMeta}>
                                                        {inst.loader} • {inst.version}
                                                    </div>
                                                </div>
                                                {inst.isFavorite && <Star size={12} fill="#ffaa00" color="#ffaa00" />}
                                                {selectedInstance?.id === inst.id && <Check size={14} />}
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Create New Button */}
                                <div className={styles.dropdownFooter}>
                                    <button
                                        className={styles.createNewBtn}
                                        onClick={() => {
                                            setShowInstanceDropdown(false);
                                            setShowCreateModal(true);
                                        }}
                                    >
                                        <Box size={14} />
                                        Create New Profile
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        className={`${styles.launchBtn} ${isLaunching ? styles.launching : ''}`}
                        onClick={instances.length === 0 ? () => setShowCreateModal(true) : handleLaunch}
                        disabled={isLaunching || (!selectedInstance && instances.length > 0)}
                    >
                        {isLaunching ? (
                            <div className={styles.launchContent}>
                                <div className={styles.statusText}>
                                    <span>{launchStatus}</span>
                                    <span>{Math.round(launchProgress)}%</span>
                                </div>
                                {downloadStats && downloadStats.totalBytes > 0 && (
                                    <div className={styles.downloadInfo}>
                                        <span>{(downloadStats.currentBytes / 1024 / 1024).toFixed(1)} MB / {(downloadStats.totalBytes / 1024 / 1024).toFixed(1)} MB</span>
                                        {downloadStats.eta > 0 && <span>ETA: {formatEta(downloadStats.eta)}</span>}
                                    </div>
                                )}
                                <div className={styles.progressBarBg}>
                                    <div
                                        className={styles.progressBarFill}
                                        style={{ width: `${launchProgress}%` }}
                                    />
                                </div>
                            </div>
                        ) : (
                            <>
                                <Rocket size={20} />
                                {instances.length === 0 ? 'Create Profile' : selectedInstance ? 'Launch Game' : 'Select Profile'}
                            </>
                        )}
                    </button>
                </div>

                <div className={styles.skinContainer}>
                    <SkinViewer3D
                        skinUrl={(user as any).preferredSkin || user.name}
                        capeUrl={(user as any).preferredCape}
                        width={280}
                        height={340}
                        lastUpdated={lastUpdated}
                    />
                    <div className={styles.skinControls}>
                        <button
                            className={styles.skinControlBtn}
                            onClick={() => setShowSkinModal(true)}
                        >
                            Change Skin
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}><Layers size={22} /></div>
                    <div className={styles.statInfo}>
                        <div className={styles.statValue}>{instances.length}</div>
                        <div className={styles.statLabel}>Profiles</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}><Star size={22} /></div>
                    <div className={styles.statInfo}>
                        <div className={styles.statValue}>{instances.filter(i => i.isFavorite).length}</div>
                        <div className={styles.statLabel}>Favorites</div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={styles.statIcon}><Clock size={22} /></div>
                    <div className={styles.statInfo}>
                        <div className={styles.statValue}>
                            {recentInstances.length > 0 ? formatDate(recentInstances[0].lastPlayed || 0) : 'Never'}
                        </div>
                        <div className={styles.statLabel}>Last Played</div>
                    </div>
                </div>
            </div>

            {/* Favorites Section */}
            {instances.filter(i => i.isFavorite).length > 0 && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>
                        <h3><Star size={18} /> Favorite Profiles</h3>
                    </div>
                    <div className={styles.profilesGrid}>
                        {instances.filter(i => i.isFavorite).map(inst => (
                            <div
                                key={inst.id}
                                className={`${styles.profileCard} ${selectedInstance?.id === inst.id ? styles.active : ''}`}
                                onClick={() => setSelectedInstance(inst)}
                            >
                                <div className={styles.profileIcon} style={{ background: 'rgba(255, 170, 0, 0.1)', color: '#ffaa00' }}>
                                    {inst.name.charAt(0).toUpperCase()}
                                </div>
                                <div className={styles.profileDetails}>
                                    <div className={styles.profileCardName}>{inst.name}</div>
                                    <div className={styles.profileCardMeta}>
                                        {inst.loader} • {inst.version} • {formatPlayTime(inst.playTime)}
                                    </div>
                                </div>
                                <button
                                    className={`${styles.favoriteBtn} ${inst.isFavorite ? styles.active : ''}`}
                                    onClick={(e) => handleToggleFavorite(e, inst)}
                                >
                                    <Star size={16} fill="#ffaa00" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Recent Profiles */}
            {instances.length > 0 && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>
                        <h3><FolderOpen size={18} /> Recent Profiles</h3>
                        <button
                            className={styles.viewAllBtn}
                            onClick={() => onNavigate?.('library')}
                        >
                            View All <ChevronRight size={14} />
                        </button>
                    </div>
                    <div className={styles.profilesGrid}>
                        {recentInstances.map(inst => (
                            <div
                                key={inst.id}
                                className={`${styles.profileCard} ${selectedInstance?.id === inst.id ? styles.active : ''}`}
                                onClick={() => setSelectedInstance(inst)}
                            >
                                <div className={styles.profileIcon}>
                                    {inst.name.charAt(0).toUpperCase()}
                                </div>
                                <div className={styles.profileDetails}>
                                    <div className={styles.profileCardName}>{inst.name}</div>
                                    <div className={styles.profileCardMeta}>
                                        {inst.loader} • {inst.version} • {formatPlayTime(inst.playTime)}
                                    </div>
                                </div>
                                <button
                                    className={`${styles.favoriteBtn} ${inst.isFavorite ? styles.active : ''}`}
                                    onClick={(e) => handleToggleFavorite(e, inst)}
                                >
                                    <Star size={16} fill={inst.isFavorite ? '#ffaa00' : 'none'} />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Featured Servers */}
            {featuredServers.length > 0 && (
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>
                        <h3><Server size={18} /> Featured Servers</h3>
                    </div>
                    <div className={styles.serversGrid}>
                        {featuredServers.map(server => {
                            const status = featuredStatuses[server.id];
                            return (
                                <div key={server.id} className={styles.serverCard}>
                                    <div className={styles.serverIcon}>
                                        {status?.icon ? (
                                            <img src={status.icon} alt="" />
                                        ) : (
                                            <Globe size={24} />
                                        )}
                                    </div>
                                    <div className={styles.serverDetails}>
                                        <div className={styles.serverName}>
                                            {server.name}
                                            <span className={`${styles.serverStatus} ${status?.online ? styles.online : ''}`} />
                                        </div>
                                        <div className={styles.serverDesc}>{server.description}</div>
                                        {status?.players && (
                                            <div className={styles.serverPlayers}>
                                                <Users size={10} /> {status.players.online}/{status.players.max} players
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        className={styles.copyBtn}
                                        onClick={() => handleCopyIp(server.address, server.id)}
                                    >
                                        {copiedId === server.id ? <Check size={16} /> : <Copy size={16} />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Server Status Widget */}
            <div className={styles.statusWidget}>
                <div className={styles.statusHeader}>
                    <h3><Wifi size={16} /> Server Status Checker</h3>
                    <p>Check if a Minecraft server is online</p>
                </div>
                <div className={styles.statusInputGroup}>
                    <input
                        type="text"
                        className={styles.statusInput}
                        placeholder="Enter server IP (e.g. play.hypixel.net)"
                        value={serverIp}
                        onChange={(e) => setServerIp(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleCheckStatus()}
                    />
                    <button
                        className={styles.statusCheckBtn}
                        onClick={handleCheckStatus}
                        disabled={statusLoading}
                    >
                        {statusLoading ? 'Checking...' : <><Wifi size={16} /> Check</>}
                    </button>
                </div>
                {serverStatus && (
                    <div className={styles.statusResult}>
                        <div className={styles.statusResultIcon}>
                            {serverStatus.icon ? (
                                <img src={serverStatus.icon} alt="" />
                            ) : (
                                <Server size={32} />
                            )}
                        </div>
                        <div className={styles.statusResultInfo}>
                            <div className={styles.statusResultMotd}>{serverStatus.motd}</div>
                            <div className={styles.statusResultMeta}>
                                <span className={`${styles.statusBadge} ${!serverStatus.online ? styles.offline : ''}`}>
                                    {serverStatus.online ? 'Online' : 'Offline'}
                                </span>
                                {serverStatus.players && (
                                    <span><Users size={12} /> {serverStatus.players.online}/{serverStatus.players.max}</span>
                                )}
                                <span>{serverStatus.version}</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Skin Modal */}
            {showSkinModal && (
                <div className={styles.modalOverlay} onClick={() => setShowSkinModal(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <h3>Change Skin</h3>
                        <p>Enter a Minecraft username to preview that skin</p>
                        <input
                            type="text"
                            className={styles.modalInput}
                            value={tempSkin}
                            onChange={(e) => setTempSkin(e.target.value)}
                            placeholder="Username"
                            autoFocus
                        />
                        <div className={styles.modalActions}>
                            <button
                                className={styles.modalCancel}
                                onClick={() => setShowSkinModal(false)}
                            >
                                Cancel
                            </button>
                            <button
                                className={styles.modalConfirm}
                                onClick={async () => {
                                    if (tempSkin && setUser) {
                                        const { AccountManager } = await import('../utils/AccountManager');
                                        AccountManager.updateAccount(user.uuid, { preferredSkin: tempSkin });
                                        setUser((prev: any) => ({ ...prev, preferredSkin: tempSkin }));
                                        setLastUpdated(Date.now());
                                        showToast('Skin updated!', 'success');
                                    }
                                    setShowSkinModal(false);
                                }}
                            >
                                Apply
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Create Instance Modal */}
            {showCreateModal && (
                <CreateInstanceModal
                    onClose={() => setShowCreateModal(false)}
                    onCreated={handleCreated}
                />
            )}
        </div>
    );
};
