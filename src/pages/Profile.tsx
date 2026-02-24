import React from 'react';
import styles from './Profile.module.css';
import { SkinViewer3D } from '../components/SkinViewer3D';
import { UserAvatar } from '../components/UserAvatar';
import { ProfileService, Badge } from '../services/ProfileService';
import { useToast } from '../context/ToastContext';
import { SkinUtils } from '../utils/SkinUtils';
import { Edit3, Upload, Trash2, Shield, Type, Clock, Gamepad2, Trophy, Calendar, Globe, Award, Star, Heart, Code, Bug, Gift, Crown, LucideIcon } from 'lucide-react';

// Icon mapping for badges
const iconMap: Record<string, LucideIcon> = {
    Shield,
    Award,
    Star,
    Heart,
    Code,
    Bug,
    Gift,
    Crown,
    Trophy,
    Globe,
    Clock,
    Gamepad2,
    Edit3,
    Type
};

// Helper component to render badge icon
const BadgeIcon: React.FC<{ iconName: string; size?: number; color?: string }> = ({ iconName, size = 14, color }) => {
    const IconComponent = iconMap[iconName] || Shield;
    return <IconComponent size={size} color={color} />;
};

interface ProfileProps {
    user: {
        name: string;
        uuid: string;
        token: string;
        type?: string;
        role?: string;
        preferredSkin?: string;
    };
    setUser?: (updater: any) => void;
}

const PRESETS_KEY = 'whoap_skin_presets';
const ACTIVE_PRESET_KEY = 'whoap_active_preset';

function loadPresets(defaultName: string): string[] {
    try {
        const stored = localStorage.getItem(PRESETS_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length === 3) return parsed;
        }
    } catch { /* ignore */ }
    return [defaultName, '', ''];
}

function savePresets(presets: string[]) {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
}

function loadActivePreset(): number {
    try {
        const stored = localStorage.getItem(ACTIVE_PRESET_KEY);
        if (stored !== null) return parseInt(stored, 10);
    } catch { /* ignore */ }
    return -1; // -1 means "none selected"
}

function saveActivePreset(index: number) {
    localStorage.setItem(ACTIVE_PRESET_KEY, String(index));
}

export const Profile: React.FC<ProfileProps> = ({ user, setUser }) => {
    const { showToast } = useToast();

    // --- STATE ---
    const [presets, setPresets] = React.useState<string[]>(() => loadPresets(user.preferredSkin || user.name));
    const [activePreset, setActivePreset] = React.useState<number>(-1);
    const [editingPreset, setEditingPreset] = React.useState<number | null>(null);
    const [editValue, setEditValue] = React.useState('');
    const [lastUpdated, setLastUpdated] = React.useState<number>(Date.now());

    const [badges, setBadges] = React.useState<Badge[]>([]);
    const [copied, setCopied] = React.useState(false);
    const [profile, setProfile] = React.useState<any>(null);

    // --- STATISTICS STATE ---
    const [statistics, setStatistics] = React.useState({
        totalPlayTime: 0,
        instancesCreated: 0,
        worldsExplored: 0,
        lastPlayed: null as string | null,
        favoriteInstance: ''
    });

    const [presetNames, setPresetNames] = React.useState<string[]>(() => {
        try {
            const stored = localStorage.getItem('whoap_skin_preset_names');
            return stored ? JSON.parse(stored) : ['', '', ''];
        } catch { return ['', '', '']; }
    });

    // --- CAPES STATE ---
    const CAPE_PRESETS_KEY = 'whoap_cape_presets';
    const ACTIVE_CAPE_PRESET_KEY = 'whoap_active_cape_preset';

    const [capePresets, setCapePresets] = React.useState<string[]>(() => {
        try {
            const stored = localStorage.getItem(CAPE_PRESETS_KEY);
            return stored ? JSON.parse(stored) : ['', '', ''];
        } catch { return ['', '', '']; }
    });
    const [activeCapePreset, setActiveCapePreset] = React.useState<number>(-1);
    const [editingCape, setEditingCape] = React.useState<number | null>(null);
    const [capePresetNames, setCapePresetNames] = React.useState<string[]>(() => {
        try {
            const stored = localStorage.getItem('whoap_cape_preset_names');
            return stored ? JSON.parse(stored) : ['', '', ''];
        } catch { return ['', '', '']; }
    });
    const [renamingSlot, setRenamingSlot] = React.useState<{ type: 'skin' | 'cape', index: number } | null>(null);
    const [renameValue, setRenameValue] = React.useState('');


    // --- DERIVED STATE ---
    const activeSkinName = activePreset >= 0 && presets[activePreset]
        ? presets[activePreset]
        : user.preferredSkin || user.name;

    const activeCapeName = activeCapePreset >= 0 && capePresets[activeCapePreset]
        ? capePresets[activeCapePreset]
        : (user as any).preferredCape;

    // --- EFFECTS ---

    // Auto-select matching skin preset
    React.useEffect(() => {
        const savedActive = loadActivePreset();
        const preferred = user.preferredSkin || user.name;

        if (savedActive >= 0 && savedActive < 3 && presets[savedActive]) {
            const presetVal = presets[savedActive];
            if (SkinUtils.getFileName(presetVal) === SkinUtils.getFileName(preferred)) {
                setActivePreset(savedActive);
                return;
            }
        }

        const matchIdx = presets.findIndex(p => {
            if (!p) return false;
            return SkinUtils.getFileName(p) === SkinUtils.getFileName(preferred);
        });

        if (matchIdx >= 0) {
            setActivePreset(matchIdx);
            saveActivePreset(matchIdx);
        } else if (user.preferredSkin) {
            // No preset matches but user has a preferred skin — inject it into slot 0
            const newPresets = [...presets];
            newPresets[0] = user.preferredSkin;
            setPresets(newPresets);
            setActivePreset(0);
            saveActivePreset(0);
        } else {
            setActivePreset(-1);
        }
    }, [presets, user.preferredSkin]);

    // Load active cape preset
    React.useEffect(() => {
        try {
            const stored = localStorage.getItem(ACTIVE_CAPE_PRESET_KEY);
            if (stored !== null) setActiveCapePreset(parseInt(stored, 10));
        } catch { /* ignore */ }
    }, []);

    // Get dirs
    React.useEffect(() => {
        window.ipcRenderer.invoke('skin:get-path').then(() => { }).catch(() => { });
        window.ipcRenderer.invoke('cape:get-path').then(() => { }).catch(() => { });
    }, []);

    // Load badges/profile — only when online and whoap account
    React.useEffect(() => {
        const load = async () => {
            if (user.type === 'yashin' && navigator.onLine) {
                try {
                    const [fetchedBadges, fetchedProfile] = await Promise.all([
                        ProfileService.getUserBadges(user.uuid),
                        ProfileService.getProfile(user.uuid)
                    ]);
                    setBadges(fetchedBadges);
                    setProfile(fetchedProfile);
                } catch (e) { console.warn('[Profile] Failed to load data', e); }
            }
        };
        load();
    }, [user.uuid, user.type]);

    // Load statistics — fully offline from IPC, graceful fallback on error
    React.useEffect(() => {
        const loadStats = async () => {
            try {
                // Fetch instances (primary data source — available offline)
                let instances: any[] = [];
                try {
                    instances = await window.ipcRenderer.invoke('instance:list') ?? [];
                } catch { /* no instances IPC */ }

                // Fetch worlds — may not exist on all builds, fail silently
                let worldCount = 0;
                try {
                    const worlds = await window.ipcRenderer.invoke('worlds:list-all');
                    worldCount = Array.isArray(worlds) ? worlds.length : 0;
                } catch { /* worlds IPC unavailable */ }

                let totalPlayTime = 0;
                let lastPlayedDate: string | null = null;
                let favoriteInstance = '';
                let maxPlayTime = 0;

                instances.forEach((inst: any) => {
                    const playTime = typeof inst.playTime === 'number' ? inst.playTime : 0;
                    totalPlayTime += playTime;

                    if (playTime > maxPlayTime) {
                        maxPlayTime = playTime;
                        favoriteInstance = inst.name ?? '';
                    }

                    if (inst.lastPlayed) {
                        try {
                            const lastDate = new Date(inst.lastPlayed);
                            if (!isNaN(lastDate.getTime())) {
                                if (!lastPlayedDate || lastDate > new Date(lastPlayedDate)) {
                                    lastPlayedDate = inst.lastPlayed;
                                }
                            }
                        } catch { /* bad date */ }
                    }
                });

                setStatistics({
                    totalPlayTime,
                    instancesCreated: instances.length,
                    worldsExplored: worldCount,
                    lastPlayed: lastPlayedDate,
                    favoriteInstance
                });
            } catch (e) {
                console.warn('[Profile] Failed to load statistics', e);
            }
        };
        loadStats();
    }, []);

    // Persist presets
    React.useEffect(() => { savePresets(presets); }, [presets]);
    React.useEffect(() => { localStorage.setItem(CAPE_PRESETS_KEY, JSON.stringify(capePresets)); }, [capePresets]);
    React.useEffect(() => { localStorage.setItem('whoap_skin_preset_names', JSON.stringify(presetNames)); }, [presetNames]);
    React.useEffect(() => { localStorage.setItem('whoap_cape_preset_names', JSON.stringify(capePresetNames)); }, [capePresetNames]);

    // --- HANDLERS (SKINS) ---

    const handleSelectPreset = async (index: number) => {
        const skinName = presets[index];
        if (!skinName) {
            setEditingPreset(index);
            setEditValue('');
            return;
        }

        // Toggle off if already active (Deselect)
        if (activePreset === index) {
            setActivePreset(-1);
            saveActivePreset(-1);

            // Revert to default
            try {
                const { AccountManager } = await import('../utils/AccountManager');
                AccountManager.updateAccount(user.uuid, { preferredSkin: undefined });
                if (setUser) setUser((prev: any) => ({ ...prev, preferredSkin: undefined }));
                showToast('Reset to default skin', 'success');
            } catch (e) { console.error(e); }
            return;
        }

        setActivePreset(index);
        saveActivePreset(index);

        try {
            const { AccountManager } = await import('../utils/AccountManager');
            AccountManager.updateAccount(user.uuid, { preferredSkin: skinName });
            if (setUser) setUser((prev: any) => ({ ...prev, preferredSkin: skinName }));
            showToast(`Skin switched to ${SkinUtils.getDisplayName(skinName, user.name)}`, 'success');
        } catch (e) {
            console.error('[Profile] Failed to update skin', e);
        }
    };

    const handleEditPreset = (index: number) => {
        setEditingPreset(index);
        const current = presets[index] || '';
        setEditValue(SkinUtils.isCustom(current) ? '' : current);
    };

    const handleSavePreset = () => {
        if (editingPreset === null) return;
        const trimmed = editValue.trim();
        if (!trimmed) { setEditingPreset(null); return; }
        const newPresets = [...presets];
        newPresets[editingPreset] = trimmed;
        setPresets(newPresets);
        setEditingPreset(null);
        if (activePreset === editingPreset) {
            (async () => {
                const { AccountManager } = await import('../utils/AccountManager');
                AccountManager.updateAccount(user.uuid, { preferredSkin: trimmed });
                if (setUser) setUser((prev: any) => ({ ...prev, preferredSkin: trimmed }));
            })();
        }
    };

    const handleImportSkin = async () => {
        if (editingPreset === null) return;
        try {
            const result = await window.ipcRenderer.invoke('skin:import');
            if (result.success && result.fileName) {
                const presetValue = `file:${result.fileName}`;
                const newPresets = [...presets];
                newPresets[editingPreset] = presetValue;
                setPresets(newPresets);
                setEditingPreset(null);
                setLastUpdated(Date.now()); // Break cache

                setActivePreset(editingPreset);
                saveActivePreset(editingPreset);

                showToast(`Skin imported: ${result.fileName.replace('.png', '')}`, 'success');
                const { AccountManager } = await import('../utils/AccountManager');
                AccountManager.updateAccount(user.uuid, { preferredSkin: presetValue });
                if (setUser) setUser((prev: any) => ({ ...prev, preferredSkin: presetValue }));
            }
        } catch (e) {
            showToast('Failed to import skin file', 'error');
        }
    };

    const handleClearPreset = async (index: number) => {
        const newPresets = [...presets];
        newPresets[index] = '';
        setPresets(newPresets);

        // If we cleared the active preset, reset to default (undefined)
        if (activePreset === index) {
            setActivePreset(-1); // None selected
            saveActivePreset(-1);
            try {
                const { AccountManager } = await import('../utils/AccountManager');
                AccountManager.updateAccount(user.uuid, { preferredSkin: undefined });
                if (setUser) setUser((prev: any) => ({ ...prev, preferredSkin: undefined }));
                showToast('Reset to default skin', 'success');
            } catch (e) { console.error(e); }
        }
    };

    // --- HANDLERS (CAPES) ---

    const handleSelectCape = async (index: number) => {
        const capeName = capePresets[index];
        if (!capeName) {
            setEditingCape(index);
            return;
        }

        // Toggle off if already active (Deselect)
        if (activeCapePreset === index) {
            setActiveCapePreset(-1);
            localStorage.setItem(ACTIVE_CAPE_PRESET_KEY, '-1');

            try {
                const { AccountManager } = await import('../utils/AccountManager');
                AccountManager.updateAccount(user.uuid, { preferredCape: undefined });
                if (setUser) setUser((prev: any) => ({ ...prev, preferredCape: undefined }));
                showToast('Cape removed', 'success');
            } catch (e) { console.error(e); }
            return;
        }

        setActiveCapePreset(index);
        localStorage.setItem(ACTIVE_CAPE_PRESET_KEY, String(index));

        try {
            const { AccountManager } = await import('../utils/AccountManager');
            AccountManager.updateAccount(user.uuid, { preferredCape: capeName });
            if (setUser) setUser((prev: any) => ({ ...prev, preferredCape: capeName }));
            showToast(`Cape switched to ${SkinUtils.getDisplayName(capeName, user.name)}`, 'success');
        } catch (e) {
            console.error('[Profile] Failed to update cape', e);
        }
    };

    const handleImportCape = async () => {
        if (editingCape === null) return;
        try {
            const result = await window.ipcRenderer.invoke('cape:import');
            if (result.success && result.fileName) {
                const presetValue = `file:${result.fileName}`;
                const newPresets = [...capePresets];
                newPresets[editingCape] = presetValue;
                setCapePresets(newPresets);
                setEditingCape(null);
                setLastUpdated(Date.now()); // Break cache
                setActiveCapePreset(editingCape);
                localStorage.setItem(ACTIVE_CAPE_PRESET_KEY, String(editingCape));

                const { AccountManager } = await import('../utils/AccountManager');
                AccountManager.updateAccount(user.uuid, { preferredCape: presetValue });
                if (setUser) setUser((prev: any) => ({ ...prev, preferredCape: presetValue }));
                showToast('Cape imported', 'success');
            }
        } catch (e) {
            showToast('Failed to import cape', 'error');
        }
    };

    const handleClearCape = async (index: number) => {
        const newPresets = [...capePresets];
        newPresets[index] = '';
        setCapePresets(newPresets);
        if (activeCapePreset === index) {
            setActiveCapePreset(-1);
            localStorage.setItem(ACTIVE_CAPE_PRESET_KEY, '-1');
            try {
                const { AccountManager } = await import('../utils/AccountManager');
                AccountManager.updateAccount(user.uuid, { preferredCape: undefined });
                if (setUser) setUser((prev: any) => ({ ...prev, preferredCape: undefined }));
            } catch (e) { console.error(e); }
        }
        setEditingCape(null);
    };

    const handleCopyUuid = () => {
        navigator.clipboard.writeText(user.uuid);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const roleColors: Record<string, string> = {
        developer: '#00a8ff',
        admin: '#ff4757',
        user: '#7f8c8d'
    };
    const roleLabel: Record<string, string> = {
        developer: 'Developer',
        admin: 'Admin',
        user: 'Member'
    };
    const role = user.role || 'user';

    return (
        <div className={styles.profilePage}>
            {/* Left Panel */}
            <div className={styles.leftPanel}>
                {/* Header */}
                <div className={styles.profileHeader}>
                    <UserAvatar
                        username={SkinUtils.getDisplayName(activeSkinName)}
                        preferredSkin={activeSkinName}
                        uuid={user.uuid}
                        accountType={user.type as any}
                        className={styles.avatarLarge}
                        lastUpdated={lastUpdated}
                    />
                    <div className={styles.headerInfo}>
                        <div className={styles.displayName}>{user.name}</div>
                        <div
                            className={styles.roleBadge}
                            style={{
                                background: `${roleColors[role]}15`,
                                color: roleColors[role],
                                border: `1px solid ${roleColors[role]}30`
                            }}
                        >
                            {roleLabel[role] || 'Member'}
                        </div>
                        <div className={styles.uuidText} onClick={handleCopyUuid} title="Click to copy">
                            {copied ? '✓ Copied!' : user.uuid.slice(0, 8) + '...'}
                        </div>
                    </div>
                </div>

                {/* Account Info */}
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Account Info</div>
                    <div className={styles.infoGrid}>
                        <div className={styles.infoCard}>
                            <span className={styles.infoLabel}>Account Type</span>
                            <span className={styles.infoValue}>
                                {user.type === 'yashin' ? 'Yashin' : user.type === 'microsoft' ? 'Microsoft' : 'Offline'}
                            </span>
                        </div>
                        <div className={styles.infoCard}>
                            <span className={styles.infoLabel}>Joined</span>
                            <span className={styles.infoValue}>
                                {profile?.joined_at
                                    ? new Date(profile.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                    : '—'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Badges — only shown for whoap accounts */}
                {user.type === 'yashin' && (
                    <div className={styles.section}>
                        <div className={styles.sectionTitle}>Badges</div>
                        {badges.length > 0 ? (
                            <div className={styles.badgeGrid}>
                                {badges.map(badge => (
                                    <div
                                        key={badge.id}
                                        className={styles.badge}
                                        style={{ borderColor: `${badge.color}30` }}
                                        title={badge.description}
                                    >
                                        <span className={styles.badgeIcon}>
                                            <BadgeIcon iconName={badge.icon} size={14} color={badge.color} />
                                        </span>
                                        <span style={{ color: badge.color }}>{badge.name}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <span className={styles.noBadges}>No badges yet</span>
                        )}
                    </div>
                )}

                {/* Statistics */}
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>
                        <Trophy size={16} style={{ marginRight: 8 }} />
                        Statistics
                    </div>
                    <div className={styles.statsGrid}>
                        <div className={styles.statCard}>
                            <Clock size={20} className={styles.statIcon} />
                            <div className={styles.statInfo}>
                                <span className={styles.statValue}>
                                    {Math.floor(statistics.totalPlayTime / 3600)}h {Math.floor((statistics.totalPlayTime % 3600) / 60)}m
                                </span>
                                <span className={styles.statLabel}>Total Playtime</span>
                            </div>
                        </div>
                        <div className={styles.statCard}>
                            <Gamepad2 size={20} className={styles.statIcon} />
                            <div className={styles.statInfo}>
                                <span className={styles.statValue}>{statistics.instancesCreated}</span>
                                <span className={styles.statLabel}>Instances</span>
                            </div>
                        </div>
                        <div className={styles.statCard}>
                            <Globe size={20} className={styles.statIcon} />
                            <div className={styles.statInfo}>
                                <span className={styles.statValue}>{statistics.worldsExplored}</span>
                                <span className={styles.statLabel}>Worlds</span>
                            </div>
                        </div>
                        <div className={styles.statCard}>
                            <Calendar size={20} className={styles.statIcon} />
                            <div className={styles.statInfo}>
                                <span className={styles.statValue}>
                                    {statistics.lastPlayed
                                        ? new Date(statistics.lastPlayed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                                        : 'Never'}
                                </span>
                                <span className={styles.statLabel}>Last Played</span>
                            </div>
                        </div>
                    </div>
                    {statistics.favoriteInstance && (
                        <div className={styles.favoriteInstance}>
                            <span className={styles.favLabel}>Most Played:</span>
                            <span className={styles.favValue}>{statistics.favoriteInstance}</span>
                        </div>
                    )}
                </div>

                {/* Skin Presets */}
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Skin Presets</div>
                    <div className={styles.presetsGrid}>
                        {presets.map((preset, i) => (
                            <div
                                key={i}
                                className={`${styles.presetCard} ${activePreset === i && preset ? styles.active : ''}`}
                                onClick={() => handleSelectPreset(i)}
                                title={activePreset === i ? "Click to deselect (reset to default)" : "Click to select"}
                            >
                                <span className={styles.presetNumber}>Slot {i + 1}</span>
                                {preset ? (
                                    <>
                                        <UserAvatar
                                            username={presetNames[i] || SkinUtils.getDisplayName(preset, user.name)}
                                            preferredSkin={preset}
                                            uuid={user.uuid}
                                            accountType={user.type as any}
                                            className={styles.presetAvatar}
                                            lastUpdated={lastUpdated}
                                        />
                                        <span className={styles.presetName}>{presetNames[i] || SkinUtils.getDisplayName(preset, user.name)}</span>
                                        {activePreset === i && (
                                            <span className={styles.activeBadge}>Active</span>
                                        )}
                                        <div className={styles.presetActions}>
                                            <button
                                                className={styles.presetBtn}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setRenamingSlot({ type: 'skin', index: i });
                                                    setRenameValue(presetNames[i] || SkinUtils.getDisplayName(preset, user.name));
                                                }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                title="Rename"
                                            >
                                                <Type size={14} />
                                            </button>
                                            <button
                                                className={styles.presetBtn}
                                                onClick={(e) => { e.stopPropagation(); handleEditPreset(i); }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                title="Edit"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button
                                                className={`${styles.presetBtn} ${styles.remove}`}
                                                onClick={(e) => { e.stopPropagation(); handleClearPreset(i); }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                title="Reset / Clear"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className={styles.presetAvatar} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'rgba(255,255,255,0.15)',
                                            fontSize: '20px'
                                        }}>
                                            +
                                        </div>
                                        <span className={styles.presetName} style={{ color: 'rgba(255,255,255,0.2)' }}>
                                            Empty
                                        </span>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                    {activePreset < 0 && (
                        <div className={styles.noPresetHint}>No preset selected — click a slot to activate</div>
                    )}
                </div>

                {/* Cape Presets */}
                <div className={styles.section}>
                    <div className={styles.sectionTitle}>Cape Presets</div>
                    <div className={styles.presetsGrid}>
                        {capePresets.map((preset, i) => (
                            <div
                                key={i}
                                className={`${styles.presetCard} ${activeCapePreset === i && preset ? styles.active : ''}`}
                                onClick={() => handleSelectCape(i)}
                                title={activeCapePreset === i ? "Click to remove cape" : "Click to select"}
                            >
                                <span className={styles.presetNumber}>Cape {i + 1}</span>
                                {preset ? (
                                    <>
                                        <div className={styles.presetAvatar} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            background: 'rgba(255, 255, 255, 0.05)'
                                        }}>
                                            <Shield
                                                size={24}
                                                color={i === 0 ? '#ff9500' : i === 1 ? '#00d2ff' : '#ff4757'}
                                                fill={i === 0 ? 'rgba(255,149,0,0.1)' : i === 1 ? 'rgba(0,210,255,0.1)' : 'rgba(255,71,87,0.1)'}
                                            />
                                        </div>
                                        <span className={styles.presetName}>{capePresetNames[i] || SkinUtils.getDisplayName(preset, user.name)}</span>
                                        {activeCapePreset === i && (
                                            <span className={styles.activeBadge}>Active</span>
                                        )}
                                        <div className={styles.presetActions}>
                                            <button
                                                className={styles.presetBtn}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setRenamingSlot({ type: 'cape', index: i });
                                                    setRenameValue(capePresetNames[i] || SkinUtils.getDisplayName(preset, user.name));
                                                }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                title="Rename"
                                            >
                                                <Type size={14} />
                                            </button>
                                            <button
                                                className={styles.presetBtn}
                                                onClick={(e) => { e.stopPropagation(); setEditingCape(i); }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                title="Change"
                                            >
                                                <Edit3 size={14} />
                                            </button>
                                            <button
                                                className={`${styles.presetBtn} ${styles.remove}`}
                                                onClick={(e) => { e.stopPropagation(); handleClearCape(i); }}
                                                onMouseDown={(e) => e.stopPropagation()}
                                                title="Remove Cape"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className={styles.presetAvatar} style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            color: 'rgba(255,255,255,0.15)',
                                            fontSize: '20px'
                                        }}>
                                            +
                                        </div>
                                        <span className={styles.presetName} style={{ color: 'rgba(255,255,255,0.2)' }}>
                                            Empty
                                        </span>
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Right Panel - 3D Viewer */}
            <div className={styles.rightPanel}>
                <div className={styles.viewerGlow} />
                <div className={styles.viewerContainer}>
                    <SkinViewer3D
                        skinUrl={activeSkinName}
                        capeUrl={activeCapeName}
                        width={280}
                        height={420}
                        className={styles.viewerCanvas}
                        lastUpdated={lastUpdated}
                    />
                    <span className={styles.viewerSkinName}>{SkinUtils.getDisplayName(activeSkinName, user.name)}</span>
                    <span className={styles.viewerLabel}>Drag to rotate · Scroll to zoom</span>
                </div>
            </div>

            {/* Rename Slot Modal */}
            {renamingSlot !== null && (
                <div className={styles.editOverlay} onClick={() => setRenamingSlot(null)}>
                    <div className={styles.editModal} onClick={e => e.stopPropagation()}>
                        <h3 className={styles.editTitle}>Rename {renamingSlot.type === 'skin' ? 'Skin' : 'Cape'} Slot {renamingSlot.index + 1}</h3>
                        <p className={styles.editDesc}>Enter a custom name for this preset slot.</p>
                        <input
                            type="text"
                            className={styles.editInput}
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            placeholder="e.g. My Cool Skin"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    if (renamingSlot.type === 'skin') {
                                        const next = [...presetNames];
                                        next[renamingSlot.index] = renameValue;
                                        setPresetNames(next);
                                    } else {
                                        const next = [...capePresetNames];
                                        next[renamingSlot.index] = renameValue;
                                        setCapePresetNames(next);
                                    }
                                    setRenamingSlot(null);
                                }
                            }}
                        />
                        <div className={styles.editActions}>
                            <button className={styles.cancelBtn} onClick={() => setRenamingSlot(null)}>Cancel</button>
                            <button
                                className={styles.saveBtn}
                                onClick={() => {
                                    if (renamingSlot.type === 'skin') {
                                        const next = [...presetNames];
                                        next[renamingSlot.index] = renameValue;
                                        setPresetNames(next);
                                    } else {
                                        const next = [...capePresetNames];
                                        next[renamingSlot.index] = renameValue;
                                        setCapePresetNames(next);
                                    }
                                    setRenamingSlot(null);
                                }}
                            >
                                Save Name
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Preset Modal */}
            {editingPreset !== null && (
                <div className={styles.editOverlay} onClick={() => setEditingPreset(null)}>
                    <div className={styles.editModal} onClick={e => e.stopPropagation()}>
                        <h3 className={styles.editTitle}>Edit Skin Preset {editingPreset + 1}</h3>
                        <p className={styles.editDesc}>
                            Enter a Minecraft username or import a custom skin file (.png).
                        </p>
                        <input
                            type="text"
                            className={styles.editInput}
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            placeholder="Minecraft username..."
                            autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleSavePreset(); }}
                        />
                        <div className={styles.editDivider}>
                            <span>or</span>
                        </div>
                        <button className={styles.importBtn} onClick={handleImportSkin}>
                            <Upload size={16} />
                            Import Skin File (.png)
                        </button>
                        <div className={styles.editActions}>
                            <button className={styles.cancelBtn} onClick={() => setEditingPreset(null)}>Cancel</button>
                            <button className={styles.saveBtn} onClick={handleSavePreset}>Save</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Cape Modal */}
            {editingCape !== null && (
                <div className={styles.editOverlay} onClick={() => setEditingCape(null)}>
                    <div className={styles.editModal} onClick={e => e.stopPropagation()}>
                        <h3 className={styles.editTitle}>Select Cape {editingCape + 1}</h3>
                        <p className={styles.editDesc}>
                            Import a cape file (.png) to use in this slot.
                        </p>

                        <button className={styles.importBtn} onClick={handleImportCape}>
                            <Upload size={16} />
                            Import Cape File (.png)
                        </button>

                        {capePresets[editingCape] && (
                            <button className={styles.cancelBtn} style={{ marginTop: 10, width: '100%', borderColor: '#ff4757', color: '#ff4757' }} onClick={() => handleClearCape(editingCape)}>
                                Remove Cape
                            </button>
                        )}

                        <div className={styles.editActions}>
                            <button className={styles.cancelBtn} onClick={() => setEditingCape(null)}>Cancel</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
