import React from 'react';
import { PageHeader } from '../components/PageHeader';
import styles from './Home.module.css';
import { InstanceApi, Instance } from '../api/instances';
import { LaunchApi } from '../api/launch';
import { NetworkApi, ServerStatus } from '../api/network';
import { ChevronDown, Rocket, Clock, Layers, Star, Globe, Search, Wifi, WifiOff, Users as UsersIcon, Copy, Check, X } from 'lucide-react';
import heroBg from '../assets/background.png';
import loginBg from '../assets/login_bg.png';
import { useToast } from '../context/ToastContext';
import { useAnimation } from '../context/AnimationContext';
import { SkinViewer3D } from '../components/SkinViewer3D';
import { CreateInstanceModal } from '../components/CreateInstanceModal';
import { ServerService, FeaturedServer } from '../services/ServerService';

interface HomeProps {
    user: {
        name: string;
        uuid: string;
        token: string;
    };
    setUser?: (user: any) => void;
    onNavigate?: (tab: string, instanceId?: string) => void;
}

export const Home: React.FC<HomeProps> = ({ user, setUser, onNavigate }) => {
    const [instances, setInstances] = React.useState<Instance[]>([]);
    const [selectedInstance, setSelectedInstance] = React.useState<Instance | null>(null);
    const [showInstanceDropdown, setShowInstanceDropdown] = React.useState(false);
    const [lastUpdated, setLastUpdated] = React.useState<number>(Date.now());
    const [showCreateModal, setShowCreateModal] = React.useState(false);
    const [searchQuery, setSearchQuery] = React.useState('');
    const [showSearch, setShowSearch] = React.useState(false);
    const [isVisible, setIsVisible] = React.useState(false);
    const { showToast } = useToast();
    const { animationsEnabled } = useAnimation();

    // Launch State
    const [isLaunching, setIsLaunching] = React.useState(false);
    const [launchStatus, setLaunchStatus] = React.useState('');
    const [launchProgress, setLaunchProgress] = React.useState(0);

    // Server Status Widget State
    const [serverIp, setServerIp] = React.useState('');
    const [serverStatus, setServerStatus] = React.useState<ServerStatus | null>(null);
    const [statusLoading, setStatusLoading] = React.useState(false);

    // Featured Servers State
    const [featuredServers, setFeaturedServers] = React.useState<FeaturedServer[]>([]);
    const [featuredStatuses, setFeaturedStatuses] = React.useState<Record<string, ServerStatus>>({});
    const [copiedServerId, setCopiedServerId] = React.useState<string | null>(null);

    // Skin Selector State
    const [showSkinModal, setShowSkinModal] = React.useState(false);
    const [tempSkin, setTempSkin] = React.useState((user as any).preferredSkin || user.name);

    React.useEffect(() => {
        const loadData = async () => {
            const list = await InstanceApi.list();
            setInstances(list);
            if (list.length > 0) {
                // Auto-select the most recently played instance
                const mostRecent = [...list].sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))[0];
                setSelectedInstance(mostRecent);
            }

            // Load featured servers
            const servers = await ServerService.getFeaturedServers();
            setFeaturedServers(servers);

            // Fetch live status for each server
            servers.forEach(async (server) => {
                try {
                    const status = await NetworkApi.getServerStatus(server.address);
                    setFeaturedStatuses(prev => ({ ...prev, [server.id]: status }));
                } catch (e) {
                    // Ignore errors for individual servers
                }
            });
        };
        loadData();

        // Listen for launch progress
        const handleProgress = (_event: any, data: any) => {
            setLaunchStatus(data.status);
            if (data.total > 0) {
                setLaunchProgress((data.progress / data.total) * 100);
            }
        };
        window.ipcRenderer.on('launch:progress', handleProgress);

        return () => {
            // Cleanup listener if possible
        }
    }, []);

    // Animation entrance effect
    React.useEffect(() => {
        if (animationsEnabled) {
            const timer = setTimeout(() => setIsVisible(true), 50);
            return () => clearTimeout(timer);
        } else {
            setIsVisible(true);
        }
    }, [animationsEnabled]);

    const handleToggleFavorite = async (e: React.MouseEvent, inst: Instance) => {
        e.stopPropagation();
        await InstanceApi.toggleFavorite(inst.id);
        const list = await InstanceApi.list();
        setInstances(list);
    };

    const handleCreated = async () => {
        const list = await InstanceApi.list();
        setInstances(list);
        if (list.length > 0) {
            setSelectedInstance(list[0]);
        }
    };

    const handleLaunch = async () => {
        if (!selectedInstance || isLaunching) return;

        setIsLaunching(true);
        setLaunchStatus('Preparing launch...');
        setLaunchProgress(0);

        try {
            const result = await LaunchApi.launch(selectedInstance, user);
            if (!result.success) {
                showToast(`Launch Failed: ${result.error}`, 'error');
                setIsLaunching(false);
            } else {
                // Update Last Played
                await InstanceApi.updateLastPlayed(selectedInstance.id);
                // Refresh list to update times
                const list = await InstanceApi.list();
                setInstances(list);

                setLaunchStatus('Game running...');
                setTimeout(() => setIsLaunching(false), 5000);
            }
        } catch (e) {
            console.error(e);
            setIsLaunching(false);
            showToast('An unexpected error occurred during launch.', 'error');
        }
    };

    const handleCopyIp = (ip: string, id: string) => {
        navigator.clipboard.writeText(ip);
        setCopiedServerId(id);
        showToast('Server IP copied!', 'success');
        setTimeout(() => setCopiedServerId(null), 2000);
    };

    const getGreeting = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'Good Morning,';
        if (hour < 18) return 'Good Afternoon,';
        return 'Good Evening,';
    };

    const formatDate = (dateStr: string) => {
        try {
            if (!dateStr) return 'Never';
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return 'Invalid';
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return 'Error';
        }
    };

    const getLoaderDisplay = (loader: string) => {
        const map: Record<string, string> = {
            'fabric': 'F',
            'forge': 'Fg',
            'vanilla': 'V'
        };
        return map[loader.toLowerCase()] || loader.charAt(0).toUpperCase();
    };

    const handleCheckStatus = async () => {
        if (!serverIp.trim()) return;
        setStatusLoading(true);
        try {
            const status = await NetworkApi.getServerStatus(serverIp.trim());
            setServerStatus(status);
        } catch (e) {
            console.error(e);
            showToast('Failed to fetch server status.', 'error');
        } finally {
            setStatusLoading(false);
        }
    };

    // Computed Lists
    const recentInstances = [...instances]
        .sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0))
        // Deduplicate just in case
        .filter((v, i, a) => a.findIndex(t => t.id === v.id) === i)
        .slice(0, 4);

    const mostRecentInstance = recentInstances.length > 0 ? recentInstances[0] : null;
    const activeInstance = selectedInstance || mostRecentInstance;

    const filteredInstances = instances.filter(i =>
        i.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        i.version.toLowerCase().includes(searchQuery.toLowerCase())
    );


    const getAnimationClass = (baseClass: string, delay: number = 0) => {
        if (!animationsEnabled) return baseClass;
        return `${baseClass} ${isVisible ? styles.animateIn : styles.animateOut} ${styles[`delay${delay}`] || ''}`;
    };

    return (
        <div className={`${styles.container} ${!animationsEnabled ? styles.noAnimations : ''}`}>
            {/* Background Decorations */}
            <div className={styles.bgDecorations}>
                <div className={`${styles.blob} ${styles.blob1} ${animationsEnabled ? styles.animateBlob : ''}`} />
                <div className={`${styles.blob} ${styles.blob2} ${animationsEnabled ? styles.animateBlob : ''}`} />
                <div className={`${styles.blob} ${styles.blob3} ${animationsEnabled ? styles.animateBlob : ''}`} />
            </div>

            <div className={getAnimationClass(styles.headerWrapper, 0)}>
                <PageHeader
                    title="Home"
                    description={`Welcome back, ${user.name}. Ready for your next adventure?`}
                />
            </div>

            {/* Hero Section */}
            <div className={`${styles.hero} ${getAnimationClass('', 1)}`}>
                {/* Background Image with Fade */}
                <div className={styles.heroBg} style={{ backgroundImage: `url(${heroBg})` }}></div>
                <div className={styles.heroContent}>
                    <div className={styles.greeting}>{getGreeting()} {user.name}</div>

                    {/* Title Area with Dropdown */}
                    <div className={styles.titleRow}>
                        <div
                            className={styles.heroTitle}
                            onClick={() => !isLaunching && instances.length > 0 && setShowInstanceDropdown(!showInstanceDropdown)}
                            style={{ cursor: instances.length > 0 ? 'pointer' : 'default' }}
                        >
                            {activeInstance ? (
                                <>Ready to jump back into <span className={styles.profileHighlight}>{activeInstance.name}</span>?</>
                            ) : (
                                <>Create your first <span className={styles.profileHighlight}>profile</span> to start playing</>
                            )}
                        </div>
                        {instances.length > 0 && (
                            <div
                                style={{
                                    background: 'rgba(255,255,255,0.1)',
                                    borderRadius: '50%',
                                    padding: 4,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    transition: 'all 0.2s',
                                    transform: showInstanceDropdown ? 'rotate(180deg)' : 'rotate(0deg)'
                                }}
                                onClick={() => !isLaunching && setShowInstanceDropdown(!showInstanceDropdown)}
                            >
                                <ChevronDown size={20} color="white" />
                            </div>
                        )}

                        {/* Instance Dropdown - Redesigned */}
                        {showInstanceDropdown && instances.length > 0 && (
                            <div
                                className={styles.instanceDropdown}
                                style={{ top: 'calc(100% + 12px)', left: 0, width: 340 }}
                                onWheel={(e) => e.stopPropagation()}
                            >
                                <div className={styles.dropdownHeader}>
                                    <div className={styles.dropdownTitle}>Switch Profile</div>
                                    <div
                                        className={`${styles.searchToggle} ${showSearch ? styles.searchActive : ''}`}
                                        onClick={() => {
                                            setShowSearch(!showSearch);
                                            if (showSearch) setSearchQuery('');
                                        }}
                                    >
                                        <Search size={16} />
                                    </div>
                                </div>

                                {showSearch && (
                                    <div className={styles.searchContainer}>
                                        <input
                                            type="text"
                                            className={styles.searchInput}
                                            placeholder="Search profiles..."
                                            autoFocus
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                        />
                                        {searchQuery && (
                                            <X
                                                size={14}
                                                className={styles.clearSearch}
                                                onClick={() => setSearchQuery('')}
                                            />
                                        )}
                                    </div>
                                )}

                                <div className={styles.dropdownList}>
                                    {filteredInstances.map(inst => (
                                        <div
                                            key={inst.id}
                                            className={styles.instanceOption}
                                            onClick={() => {
                                                setSelectedInstance(inst);
                                                setShowInstanceDropdown(false);
                                                setShowSearch(false);
                                                setSearchQuery('');
                                            }}
                                        >
                                            <div className={styles.loaderBadge}>
                                                {getLoaderDisplay(inst.loader)}
                                            </div>
                                            <div style={{ flex: 1, overflow: 'hidden' }}>
                                                <div className={styles.instanceName}>{inst.name}</div>
                                                <div style={{ fontSize: '11px', color: '#666', marginTop: 2 }}>
                                                    {inst.version}
                                                </div>
                                            </div>
                                            <div onClick={(e) => handleToggleFavorite(e, inst)} style={{ flexShrink: 0 }}>
                                                <Star
                                                    size={16}
                                                    fill={inst.isFavorite ? "#ffaa00" : "none"}
                                                    color={inst.isFavorite ? "#ffaa00" : "#666"}
                                                    style={{ transition: 'all 0.2s' }}
                                                />
                                            </div>
                                        </div>
                                    ))}

                                    {filteredInstances.length === 0 && (
                                        <div className={styles.noResults}>
                                            No profiles found
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {selectedInstance && (
                        <div className={styles.lastPlayed}>
                            <Clock size={14} color="#aaa" />
                            <span style={{ fontSize: '13px', color: '#ccc' }}>
                                Last played {selectedInstance.lastPlayed > 0 ? formatDate(new Date(selectedInstance.lastPlayed).toISOString()) : 'Never'}
                            </span>
                        </div>
                    )}

                    <div className={styles.actionContainer}>
                        <button
                            className={`${styles.playBtn} ${isLaunching ? styles.launching : ''}`}
                            onClick={async () => {
                                if (instances.length === 0) {
                                    setShowCreateModal(true);
                                    return;
                                }
                                if (selectedInstance) {
                                    await InstanceApi.updateLastPlayed(selectedInstance.id);
                                    handleLaunch();
                                }
                            }}
                            disabled={isLaunching || (!selectedInstance && instances.length > 0)}
                            data-testid="home-launch-button"
                        >
                            {isLaunching ? (
                                <div className={styles.launchContent}>
                                    <div className={styles.statusText}>
                                        <span className={styles.statusTitle}>{launchStatus}</span>
                                        <span className={styles.statusPercent}>{Math.round(launchProgress)}%</span>
                                    </div>
                                    <div className={styles.progressBarBg}>
                                        <div
                                            className={styles.progressBarFill}
                                            style={{ width: `${launchProgress}%` }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <Rocket size={20} style={{ marginRight: 8 }} />
                                    {instances.length === 0 ? 'CREATE PROFILE' : selectedInstance ? 'LAUNCH' : 'SELECT PROFILE'}
                                </>
                            )}
                        </button>
                        {selectedInstance && (
                            <button
                                className={styles.libBtn}
                                onClick={() => onNavigate?.('library', selectedInstance.id)}
                                title="Open Library"
                            >
                                <span>Library</span>
                            </button>
                        )}
                    </div>
                </div>
                {activeInstance ? (
                    <div
                        className={styles.skinContainer}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setShowSkinModal(true);
                        }}
                    >
                        <div className={styles.skinOverlay}>
                            <div className={styles.skinNotice}>Change Skin</div>
                        </div>
                        <SkinViewer3D
                            skinUrl={(user as any).preferredSkin || user.name}
                            capeUrl={(user as any).preferredCape}
                            width={300}
                            height={450}
                            autoRotate={false}
                            initialRotation={{ y: 0.8 }}
                            className={styles.heroImage}
                            lastUpdated={lastUpdated}
                        />
                    </div>
                ) : (
                    <div className={styles.emptyProfileIcon}>
                        <Layers size={80} strokeWidth={1.5} />
                    </div>
                )}
            </div>

            {/* Custom Skin Modal */}
            {showSkinModal && (
                <div className={styles.modalOverlay} onClick={() => setShowSkinModal(false)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <h3>Change Preview Skin</h3>
                        <p>Enter a Minecraft username to change your skin preview.</p>
                        <input
                            type="text"
                            value={tempSkin}
                            onChange={e => setTempSkin(e.target.value)}
                            placeholder="Username..."
                            className={styles.modalInput}
                            autoFocus
                        />
                        <div className={styles.modalActions}>
                            <button onClick={() => setShowSkinModal(false)} className={styles.cancelBtn}>Cancel</button>
                            <button onClick={async () => {
                                if (tempSkin && tempSkin !== ((user as any).preferredSkin || user.name)) {
                                    // 1. Update Cloud (if applicable)
                                    if ((user as any).type === 'whoap') {
                                        try {
                                            const { ProfileService } = await import('../services/ProfileService');
                                            await ProfileService.updateProfile(user.uuid, { preferred_skin: tempSkin });
                                        } catch (e) {
                                            console.error("Failed to update skin in DB", e);
                                        }
                                    }

                                    // 2. Update Local Storage (AccountManager)
                                    const { AccountManager } = await import('../utils/AccountManager');
                                    AccountManager.updateAccount(user.uuid, { preferredSkin: tempSkin });

                                    // 3. Update UI instantly
                                    if (setUser) {
                                        setUser((prev: any) => ({ ...prev, preferredSkin: tempSkin }));
                                    }
                                    setLastUpdated(Date.now());

                                    showToast(`Skin updated to ${tempSkin}!`, 'success');
                                }
                                setShowSkinModal(false);
                            }} className={styles.confirmBtn}>Apply</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Widgets Grid */}
            <div className={`${styles.widgetsGrid} ${getAnimationClass('', 2)}`}>
                {/* Stats Widget */}
                <div className={styles.statsRow}>
                    <div className={`${styles.statCard} ${animationsEnabled ? styles.statCardAnimated : ''}`}>
                        <div className={styles.statIcon}><Layers /></div>
                        <div className={styles.statInfo}>
                            <div className={styles.statValue}>{instances.length}</div>
                            <div className={styles.statLabel}>Total Profiles</div>
                        </div>
                    </div>
                    <div className={`${styles.statCard} ${animationsEnabled ? styles.statCardAnimated : ''}`}>
                        <div className={styles.statIcon}><Star /></div>
                        <div className={styles.statInfo}>
                            <div className={styles.statValue}>{instances.filter(i => i.isFavorite).length}</div>
                            <div className={styles.statLabel}>Favorites</div>
                        </div>
                    </div>
                    <div className={`${styles.statCard} ${animationsEnabled ? styles.statCardAnimated : ''}`}>
                        <div className={styles.statIcon}><Globe /></div>
                        <div className={styles.statInfo}>
                            <div className={styles.statValue}>{instances.filter(i => i.isImported).length}</div>
                            <div className={styles.statLabel}>Imported</div>
                        </div>
                    </div>
                </div>

            </div>

            {/* Featured Servers Section */}
            {featuredServers.length > 0 && (
                <div className={`${styles.featuredSection} ${getAnimationClass('', 3)}`}>
                    <div className={styles.sectionTitle}>
                        <div className={styles.titleIcon}><Globe size={18} /></div>
                        Featured Servers
                    </div>
                    <div className={styles.serverGrid}>
                        {featuredServers.map((server, index) => {
                            const statusIcon = featuredStatuses[server.id]?.icon;
                            let iconSrc = server.icon_url;

                            if (!iconSrc && statusIcon) {
                                iconSrc = statusIcon.startsWith('data:image') ? statusIcon : `data:image/png;base64,${statusIcon}`;
                            }

                            return (
                                <div 
                                    key={server.id} 
                                    className={`${styles.serverCard} ${animationsEnabled ? styles.serverCardAnimated : ''}`}
                                    style={animationsEnabled ? { animationDelay: `${index * 100}ms` } : undefined}
                                >
                                    {index < 3 && (
                                        <div className={`${styles.rankBadge} ${index === 0 ? styles.rank1 : index === 1 ? styles.rank2 : styles.rank3}`}>
                                            {index + 1}
                                        </div>
                                    )}
                                    <div className={styles.serverIcon}>
                                        {iconSrc ? <img src={iconSrc} alt={server.name} /> : <Globe size={24} />}
                                    </div>
                                    <div className={styles.serverInfo}>
                                        <div className={styles.serverName}>
                                            {server.name}
                                            {featuredStatuses[server.id] && (
                                                <span
                                                    className={`${styles.statusDot} ${featuredStatuses[server.id].online ? styles.online : styles.offline}`}
                                                    title={featuredStatuses[server.id].online ? 'Online' : 'Offline'}
                                                />
                                            )}
                                        </div>
                                        <div className={styles.serverDesc}>
                                            {featuredStatuses[server.id]?.motd ? (
                                                <span dangerouslySetInnerHTML={{ __html: featuredStatuses[server.id].motd!.replace(/\n/g, '<br/>') }}></span>
                                            ) : (
                                                server.description
                                            )}
                                        </div>
                                        {featuredStatuses[server.id]?.players && (
                                            <div className={styles.serverPlayers}>
                                                <UsersIcon size={12} />
                                                <span>{featuredStatuses[server.id].players!.online}/{featuredStatuses[server.id].players!.max}</span>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        className={styles.copyIpBtn}
                                        onClick={() => handleCopyIp(server.address, server.id)}
                                        title="Copy IP Address"
                                    >
                                        {copiedServerId === server.id ? <Check size={16} color="#4ade80" /> : <Copy size={16} />}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Server Status Widget - New Hero Style */}
            <div className={`${styles.serverWidgetHero} ${getAnimationClass('', 4)}`}>
                <div className={styles.heroBg} style={{ backgroundImage: `url(${loginBg})` }}></div>
                <div className={styles.serverWidgetContent}>
                    <div className={styles.widgetHeader}>
                        <div className={styles.greeting}>Server Monitoring</div>
                        <div className={styles.titleRow}>
                            <div className={styles.heroTitle}>
                                Check <span className={styles.profileHighlight}>Any Server</span> Status
                            </div>
                            {serverStatus && (
                                <div className={`${styles.statusChip} ${serverStatus.online ? styles.online : styles.offline}`}>
                                    {serverStatus.online ? <Wifi size={14} /> : <WifiOff size={14} />}
                                    {serverStatus.online ? 'Online' : 'Offline'}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className={styles.serverActionRow}>
                        <div className={styles.serverInputGroup}>
                            <input
                                type="text"
                                placeholder="Enter server IP (e.g. play.hypixel.net)"
                                value={serverIp}
                                onChange={(e) => setServerIp(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleCheckStatus()}
                                className={styles.serverInputHero}
                            />
                            <button
                                onClick={handleCheckStatus}
                                className={styles.checkBtnHero}
                                disabled={statusLoading}
                            >
                                {statusLoading ? <div className={styles.spinner}></div> : <Search size={20} />}
                            </button>
                        </div>

                        {serverStatus && serverStatus.online && (
                            <div className={styles.statusResultHero}>
                                {serverStatus.icon && (
                                    <img src={serverStatus.icon} className={styles.serverIconHero} alt="Server Icon" />
                                )}
                                <div className={styles.serverInfoHero}>
                                    <div className={styles.serverMotdHero}>{serverStatus.motd}</div>
                                    <div className={styles.serverDetailsHero}>
                                        <span>
                                            <UsersIcon size={14} style={{ marginRight: 4 }} />
                                            <strong>{serverStatus.players?.online}</strong> / {serverStatus.players?.max}
                                        </span>
                                        <span className={styles.verBadgeHero}>{serverStatus.version}</span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!serverStatus && !statusLoading && (
                            <div className={styles.serverPlaceholderHero}>
                                <Globe size={18} style={{ opacity: 0.5 }} />
                                <span>Enter an IP to ping the server</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Recent Profiles - Full Width */}
            <div className={`${styles.recentProfilesSection} ${getAnimationClass('', 5)}`}>
                <div className={styles.sectionTitle}>
                    <div className={styles.titleIcon}><Clock size={18} /></div>
                    Recent Profiles
                </div>
                <div className={styles.grid}>
                    {recentInstances.map((inst, index) => {
                        const loaderClass = styles[`miniLoader${inst.loader.charAt(0).toUpperCase() + inst.loader.slice(1).toLowerCase()}`] || styles.miniLoaderVanilla;
                        const isSelected = selectedInstance?.id === inst.id;

                        return (
                            <div
                                key={inst.id}
                                className={`${styles.miniCard} ${isSelected ? styles.selected : ''} ${animationsEnabled ? styles.miniCardAnimated : ''}`}
                                onClick={() => setSelectedInstance(inst)}
                                style={animationsEnabled ? { animationDelay: `${index * 80}ms` } : undefined}
                            >
                                <div className={styles.miniIcon} style={{
                                    background: inst.isFavorite
                                        ? 'linear-gradient(135deg, #ff8800, #ff4400)'
                                        : undefined
                                }}>
                                    {inst.name.charAt(0).toUpperCase()}
                                </div>
                                <div className={styles.miniInfo}>
                                    <div className={styles.miniName}>{inst.name}</div>
                                    <div className={styles.miniVer}>
                                        <span className={`${styles.miniLoaderLabel} ${loaderClass}`}>
                                            {inst.loader}
                                        </span>
                                        {inst.version}
                                    </div>
                                </div>
                                <div onClick={(e) => handleToggleFavorite(e, inst)} style={{ cursor: 'pointer', opacity: inst.isFavorite ? 1 : 0.4 }}>
                                    <Star size={14} fill={inst.isFavorite ? "#ffaa00" : "none"} color={inst.isFavorite ? "#ffaa00" : "#666"} />
                                </div>
                            </div>
                        );
                    })}
                    {instances.length === 0 && <div style={{ color: '#666' }}>No profiles yet.</div>}
                </div>
            </div>


            {
                showCreateModal && (
                    <CreateInstanceModal
                        onClose={() => setShowCreateModal(false)}
                        onCreated={handleCreated}
                    />
                )
            }
        </div >
    );
};