import React from 'react';
import styles from './Sidebar.module.css';
import { Home, Settings, FolderOpen, Package, Image, LogOut, Newspaper, Code, ShieldAlert, User, Globe, Boxes } from 'lucide-react';
import logo from '../assets/logo.png';
import { UserAvatar } from './UserAvatar';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    user: {
        name: string;
        uuid: string;
        token: string;
        role?: string;
        type?: string;
        preferredSkin?: string;
    };
    onLogout?: () => void;
    isNavLocked?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, user, onLogout, isNavLocked }) => {
    const { role: realtimeRole } = useAuth();
    const role = (realtimeRole || user.role || 'user') as string;

    const roleConfig: Record<string, { label: string; color: string; icon: React.ElementType }> = {
        developer: { label: 'Developer', color: '#666', icon: Code },
        admin: { label: 'Admin', color: '#666', icon: ShieldAlert },
        user: { label: 'User', color: '#666', icon: User }
    };

    const currentRole = roleConfig[role] || { label: 'User', color: '#666', icon: User };
    const RankIcon = currentRole.icon;

    const categories = [
        {
            name: 'General',
            tabs: [
                { id: 'home', label: 'Home', icon: Home },
                { id: 'profiles', label: 'Profiles', icon: FolderOpen },
                { id: 'news', label: 'News', icon: Newspaper },
            ]
        },
        {
            name: 'Library',
            tabs: [
                { id: 'library', label: 'Library', icon: Package },
                { id: 'modpacks', label: 'Modpacks', icon: Boxes },
                { id: 'worlds', label: 'Worlds', icon: Globe },
                { id: 'screenshots', label: 'Screenshots', icon: Image },
            ]
        },
        {
            name: 'System',
            tabs: [
                { id: 'settings', label: 'Settings', icon: Settings },
                ...(role === 'developer' || role === 'admin' ? [{ id: 'admin', label: 'Admin', icon: ShieldAlert }] : []),
            ]
        }
    ];

    return (
        <div className={styles.sidebar}>
            <div className={styles.logoArea}>
                <img src={logo} alt="Yashin" className={styles.logoImg} />
                <div>
                    <div className={styles.logoText}>Yashin</div>
                    <div className={styles.logoRank} style={{ color: currentRole.color }}>{currentRole.label}</div>
                </div>
            </div>

            <nav className={styles.nav}>
                {categories.map((category) => (
                    <React.Fragment key={category.name}>
                        <div className={styles.navCategory}>{category.name}</div>
                        {category.tabs.map((tab) => {
                            const Icon = (tab as any).icon;
                            const isActive = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    className={`${styles.navItem} ${isActive ? styles.active : ''} ${isNavLocked ? styles.locked : ''}`}
                                    onClick={() => onTabChange(tab.id)}
                                    disabled={isNavLocked}
                                >
                                    <span className={styles.icon}>
                                        <Icon size={18} strokeWidth={isActive ? 2 : 1.5} />
                                    </span>
                                    <span className={styles.label}>
                                        {tab.label}
                                        {(tab as any).beta && <span className={styles.betaBadge}>BETA</span>}
                                    </span>
                                </button>
                            );
                        })}
                    </React.Fragment>
                ))}
            </nav>

            <div
                className={`${styles.userProfile} ${activeTab === 'profile' ? styles.activeProfile : ''}`}
                onClick={() => onTabChange('profile')}
            >
                <div className={styles.avatarHead}>
                    <UserAvatar
                        username={user.name}
                        preferredSkin={user.preferredSkin}
                        uuid={user.uuid}
                        accountType={user.type as any}
                        className={styles.sidebarAvatar}
                    />
                </div>
                <div className={styles.userInfo}>
                    <div className={styles.userName}>{user.name}</div>
                    <div className={styles.userRole}>
                        <RankIcon size={12} strokeWidth={2.5} color={currentRole.color} />
                        <span style={{ color: currentRole.color }}>{currentRole.label}</span>
                    </div>
                </div>
                {onLogout && (
                    <button
                        className={styles.logoutBtn}
                        onClick={(e) => { e.stopPropagation(); onLogout(); }}
                        title="Logout"
                    >
                        <LogOut size={16} />
                    </button>
                )}
            </div>
        </div>
    );
};
