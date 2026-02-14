import React from 'react';
import styles from './Sidebar.module.css';
import { Home, Settings, FolderOpen, Package, Image, LogOut, Newspaper, Code, ShieldAlert, User } from 'lucide-react';
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
        role?: 'developer' | 'admin' | 'user' | 'other';
    };
    onLogout?: () => void;
    isNavLocked?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onTabChange, user, onLogout, isNavLocked }) => {
    // Get real-time role from Supabase Auth Context
    const { role: realtimeRole } = useAuth();

    // Role Configuration
    // Prioritize real-time role, fallback to prop (for offline/initial state)
    const role = (realtimeRole || user.role || 'user') as 'developer' | 'admin' | 'user' | 'other';
    const roleConfig = {
        developer: { label: 'Developer', color: '#00a8ff', icon: Code },
        admin: { label: 'Admin', color: '#ff4757', icon: ShieldAlert },
        user: { label: 'Member', color: '#7f8c8d', icon: User },
        other: { label: 'Guest', color: '#7f8c8d', icon: User }
    };
    const currentRole = roleConfig[role] || roleConfig.user;
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
                <img src={logo} alt="Whoap" className={styles.logoImg} />
                <div style={{ display: 'flex', flexDirection: 'column', paddingLeft: '2px' }}>
                    <span className={styles.logoText}>Whoap</span>
                    <span className={styles.logoRank} style={{ color: currentRole.color }}>{currentRole.label}</span>
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
                                        <Icon size={18} strokeWidth={isActive ? 2 : 1.75} />
                                    </span>
                                    <span className={styles.label}>
                                        {tab.label}
                                        {(tab as any).beta && <span className={styles.betaBadge}>BETA</span>}
                                    </span>
                                    {isActive && <div className={styles.activeIndicator} />}
                                </button>
                            );
                        })}
                    </React.Fragment>
                ))}
            </nav>

            <div
                className={`${styles.userProfile} ${activeTab === 'profile' ? styles.activeProfile : ''}`}
                onClick={() => onTabChange('profile')}
                title="View Profile"
            >
                <div className={styles.avatarHead}>
                    <UserAvatar
                        username={user.name || (user as any).preferredSkin}
                        preferredSkin={(user as any).preferredSkin}
                        uuid={user.uuid}
                        accountType={(user as any).type}
                        className={styles.sidebarAvatar}
                    />
                </div>
                <div className={styles.userInfo}>
                    <div className={styles.userName}>{user.name}</div>
                    <div className={styles.userRole} style={{ color: currentRole.color }}>
                        <RankIcon size={12} strokeWidth={2.5} />
                        {currentRole.label}
                    </div>
                </div>
                {onLogout && (
                    <button className={styles.logoutBtn} onClick={(e) => { e.stopPropagation(); onLogout(); }} title="Logout">
                        <LogOut size={18} />
                    </button>
                )}
            </div>
        </div>
    );
};
