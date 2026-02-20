import React, { useState, useEffect } from 'react';
import styles from './WhoapProfileView.module.css';
import { SkinViewer3D } from '../components/SkinViewer3D';
import { CloudManager } from '../utils/CloudManager';
import { ProfileService, Badge } from '../services/ProfileService';
import { PublicProfile } from '../types/profile';
import { useToast } from '../context/ToastContext';
import { Trophy, Calendar, Copy, UserPlus, ExternalLink, Shield, Globe, Clock, Gamepad2, Award, Star, Heart, Code, Bug, Gift, Crown, LucideIcon, Download } from 'lucide-react';

const iconMap: Record<string, LucideIcon> = {
    Shield, Award, Star, Heart, Code, Bug, Gift, Crown, Trophy, Globe, Clock, Gamepad2
};

const BadgeIcon: React.FC<{ iconName: string; size?: number; color?: string }> = ({ iconName, size = 14, color }) => {
    const IconComponent = iconMap[iconName] || Shield;
    return <IconComponent size={size} color={color} />;
};

interface WhoapProfileViewProps {
    username: string;
    currentUser?: {
        uuid: string;
        name: string;
        type?: string;
        role?: string;
        preferredSkin?: string;
    };
    onAddFriend?: (userId: string, username: string) => void;
    onBack?: () => void;
}

export const WhoapProfileView: React.FC<WhoapProfileViewProps> = ({
    username,
    currentUser,
    onAddFriend,
    onBack
}) => {
    const { showToast } = useToast();
    const [profile, setProfile] = useState<PublicProfile | null>(null);
    const [badges, setBadges] = useState<Badge[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [selectedHistorySkin, setSelectedHistorySkin] = useState<string | null>(null);
    const [applyingSkin, setApplyingSkin] = useState(false);
    const [isOfflineMode, setIsOfflineMode] = useState(false);

    useEffect(() => {
        loadProfile();
    }, [username]);

    const loadProfile = async () => {
        setLoading(true);
        setError(null);
        setIsOfflineMode(false);

        if (!navigator.onLine) {
            // Offline fallback: Serve local current user data if viewing own profile
            if (currentUser && currentUser.name.toLowerCase() === username.toLowerCase()) {
                setProfile({
                    id: currentUser.uuid,
                    username: currentUser.name,
                    role: currentUser.role || 'user',
                    skin_url: currentUser.preferredSkin || '',
                    cape_url: '',
                    joined_at: new Date().toISOString(),
                    bio: 'Offline Mode: Some data may be outdated or unavailable.',
                    social_links: {},
                    skin_history: []
                });
                setIsOfflineMode(true);
                setBadges([]);
                setLoading(false);
                return;
            } else {
                setError('You are offline. Connect to the internet to view this profile.');
                setLoading(false);
                return;
            }
        }

        try {
            const data = await CloudManager.getPublicProfile(username);
            if (!data) {
                setError('Profile not found');
                return;
            }
            setProfile(data);

            try {
                const fetchedBadges = await ProfileService.getUserBadges(data.id);
                setBadges(fetchedBadges);
            } catch {
                setBadges([]);
            }
        } catch (e) {
            console.error('[WhoapProfileView] Failed to load profile:', e);
            setError('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    const handleCopyUsername = () => {
        if (profile) {
            navigator.clipboard.writeText(profile.username);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleAddFriend = () => {
        if (profile && onAddFriend) {
            onAddFriend(profile.id, profile.username);
        }
    };

    const handleUseThisSkin = async () => {
        if (!currentUser || !profile || currentUser.type !== 'whoap' || !navigator.onLine) return;
        setApplyingSkin(true);
        try {
            const skinUrl = selectedHistorySkin || profile.skin_url;
            const capeUrl = profile.cape_url || null;
            if (!skinUrl) return;
            const ok = await CloudManager.updateSkinAndCape(currentUser.uuid, skinUrl, capeUrl);
            if (ok) {
                showToast('Skin applied to your account!', 'success');
            } else {
                showToast('Failed to apply skin', 'error');
            }
        } catch (e) {
            console.error('[WhoapProfileView] Failed to apply skin:', e);
            showToast('Failed to apply skin', 'error');
        } finally {
            setApplyingSkin(false);
        }
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    if (loading) {
        return (
            <div className={styles.container}>
                <div className={styles.loading}>
                    <div className={styles.spinner} />
                    <span>Loading profile...</span>
                </div>
            </div>
        );
    }

    if (error || !profile) {
        return (
            <div className={styles.container}>
                <div className={styles.error}>
                    <span>{error || 'Profile not found'}</span>
                    {onBack && (
                        <button className={styles.backBtn} onClick={onBack}>
                            Go Back
                        </button>
                    )}
                </div>
            </div>
        );
    }

    const activeSkinUrl = selectedHistorySkin || profile.skin_url || profile.username;
    const isOwnProfile = currentUser?.uuid === profile.id;
    const canApplySkin = currentUser && !isOwnProfile && currentUser.type === 'whoap' && navigator.onLine && profile.skin_url;

    return (
        <div className={styles.container}>
            {onBack && (
                <button className={styles.backBtn} onClick={onBack}>
                    ← Back
                </button>
            )}

            {isOfflineMode && (
                <div className={styles.offlineBanner}>
                    <Globe size={16} />
                    <span>You are currently offline. Viewing cached profile data.</span>
                </div>
            )}

            <div className={styles.header}>
                <div className={styles.viewerSection}>
                    <div className={styles.viewerGlow} />
                    <SkinViewer3D
                        skinUrl={activeSkinUrl}
                        capeUrl={profile.cape_url || undefined}
                        width={220}
                        height={340}
                        autoRotate
                        autoRotateSpeed={0.5}
                        enableZoom
                    />

                    {canApplySkin && (
                        <button
                            className={styles.useSkinBtn}
                            onClick={handleUseThisSkin}
                            disabled={applyingSkin}
                        >
                            <Download size={14} />
                            {applyingSkin ? 'Applying...' : 'Use This Skin'}
                        </button>
                    )}
                </div>

                <div className={styles.infoSection}>
                    <div className={styles.usernameRow}>
                        <h1 className={styles.username}>{profile.username}</h1>
                        {profile.role && profile.role !== 'user' && (
                            <span
                                className={styles.roleBadge}
                                style={{
                                    background: profile.role === 'developer' ? 'rgba(0, 168, 255, 0.15)' : 'rgba(255, 71, 87, 0.15)',
                                    color: profile.role === 'developer' ? '#00a8ff' : '#ff4757',
                                    borderColor: profile.role === 'developer' ? 'rgba(0, 168, 255, 0.3)' : 'rgba(255, 71, 87, 0.3)'
                                }}
                            >
                                {profile.role === 'developer' ? 'Developer' : 'Admin'}
                            </span>
                        )}
                    </div>

                    <div className={styles.metaRow}>
                        <Calendar size={14} />
                        <span>Joined {formatDate(profile.joined_at)}</span>
                    </div>

                    {profile.bio && (
                        <p className={styles.bio}>{profile.bio}</p>
                    )}

                    <div className={styles.actions}>
                        <button className={styles.actionBtn} onClick={handleCopyUsername}>
                            <Copy size={16} />
                            {copied ? 'Copied!' : 'Copy Username'}
                        </button>

                        {currentUser && !isOwnProfile && (
                            <button className={styles.actionBtn} onClick={handleAddFriend}>
                                <UserPlus size={16} />
                                Add Friend
                            </button>
                        )}
                    </div>

                    {profile.social_links && (
                        <div className={styles.socialLinks}>
                            {profile.social_links.youtube && (
                                <a
                                    href={`https://youtube.com/${profile.social_links.youtube}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.socialLink}
                                >
                                    <ExternalLink size={14} />
                                    YouTube
                                </a>
                            )}
                            {profile.social_links.discord && (
                                <span className={styles.socialLink}>
                                    Discord: {profile.social_links.discord}
                                </span>
                            )}
                            {profile.social_links.twitter && (
                                <a
                                    href={`https://twitter.com/${profile.social_links.twitter}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.socialLink}
                                >
                                    <ExternalLink size={14} />
                                    Twitter
                                </a>
                            )}
                            {profile.social_links.github && (
                                <a
                                    href={`https://github.com/${profile.social_links.github}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.socialLink}
                                >
                                    <ExternalLink size={14} />
                                    GitHub
                                </a>
                            )}
                        </div>
                    )}

                    {badges.length > 0 && (
                        <div className={styles.badgesSection}>
                            <h3 className={styles.sectionTitle}>Badges</h3>
                            <div className={styles.badgesGrid}>
                                {badges.map(badge => (
                                    <div
                                        key={badge.id}
                                        className={styles.badge}
                                        style={{ borderColor: `${badge.color}30` }}
                                        title={badge.description}
                                    >
                                        <BadgeIcon iconName={badge.icon} size={14} color={badge.color} />
                                        <span style={{ color: badge.color }}>{badge.name}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {profile.skin_history && profile.skin_history.length > 0 && (
                <div className={styles.historySection}>
                    <h3 className={styles.sectionTitle}>
                        <Clock size={16} />
                        Skin History
                    </h3>
                    <div className={styles.historyGrid}>
                        {[{ url: profile.skin_url, uploaded_at: new Date().toISOString() }, ...profile.skin_history]
                            .filter((entry, idx, arr) => entry?.url && arr.findIndex(e => e?.url === entry.url) === idx)
                            .slice(0, 10)
                            .map((entry, i) => (
                                <div
                                    key={i}
                                    className={`${styles.historyItem} ${selectedHistorySkin === entry.url ? styles.activeHistory : ''}`}
                                    onClick={() => setSelectedHistorySkin(selectedHistorySkin === entry.url ? null : entry.url)}
                                >
                                    <SkinViewer3D
                                        skinUrl={entry.url!}
                                        capeUrl={i === 0 ? (profile.cape_url || null) : null}
                                        width={64}
                                        height={96}
                                        autoRotate
                                        autoRotateSpeed={0.5}
                                        enableZoom={false}
                                    />
                                    <span className={styles.historyDate}>
                                        {i === 0 ? 'Current' : formatDate(entry.uploaded_at)}
                                    </span>
                                </div>
                            ))}
                    </div>
                </div>
            )}
        </div>
    );
};
