import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';
import styles from './Admin.module.css';
import {
    Shield, Users, Newspaper, Award, Plus, Trash2, Ban, UserCheck, Save,
    LayoutDashboard, Settings, GitBranch, Server, Globe, Edit2, Zap,
    User, FileText, Medal, Clock, Star, Heart, Code, Bug, Gift, Crown, Trophy
} from 'lucide-react';
import { ProfileService, UserProfile, Badge as BadgeType } from '../services/ProfileService';
import { ServerService, FeaturedServer } from '../services/ServerService';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { useConfirm, usePrompt } from '../context/ConfirmContext';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';
import { ContentManager, ChangelogItem } from '../utils/ContentManager';
import { UserAvatar } from '../components/UserAvatar';

interface AdminProps {
    user: {
        name: string;
        uuid: string;
        role?: string;
    };
}

interface NewsItem {
    id: string;
    title: string;
    content: string;
    category: string;
    published: boolean;
    created_at: string;
    image_url?: string;
    color?: string;
    version?: string;
}

type TabType = 'overview' | 'users' | 'servers' | 'badges' | 'content' | 'system';

// Icon mapping for badges
const iconMap: Record<string, React.ElementType> = {
    Shield, Award, Star, Heart, Code, Bug, Gift, Crown, Trophy, Globe, Clock, User, FileText, Medal
};

// Helper to get icon component
const getIconComponent = (iconName: string): React.ElementType => {
    return iconMap[iconName] || Shield;
};

export const Admin: React.FC<AdminProps> = ({ user: propUser }) => {
    const { role: authRole, profile: authProfile } = useAuth();
    const user = {
        name: authProfile?.username || propUser.name,
        uuid: authProfile?.id || propUser.uuid,
        role: authRole || propUser.role
    };

    const [activeTab, setActiveTab] = useState<TabType>('overview');
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();
    const confirm = useConfirm();
    const prompt = usePrompt();

    // Data State
    const [badges, setBadges] = useState<BadgeType[]>([]);
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [news, setNews] = useState<NewsItem[]>([]);
    const [changelogs, setChangelogs] = useState<ChangelogItem[]>([]);
    const [featuredServers, setFeaturedServers] = useState<FeaturedServer[]>([]);

    // Form State
    const [newBadge, setNewBadge] = useState({ name: '', description: '', icon: 'Shield', color: '#ff9f43' });
    const [showBadgeForm, setShowBadgeForm] = useState(false);

    const [newNews, setNewNews] = useState({ title: '', content: '', category: 'update', image_url: '', color: '#ff8800', version: '' });
    const [showNewsForm, setShowNewsForm] = useState(false);

    const [newChangelog, setNewChangelog] = useState<{ version: string, description: string, type: 'release' | 'beta' | 'hotfix' }>({ version: '', description: '', type: 'release' });
    const [showChangelogForm, setShowChangelogForm] = useState(false);

    const [serverForm, setServerForm] = useState<Partial<FeaturedServer>>({ name: '', address: '', icon_url: '', banner_url: '', description: '' });
    const [showServerForm, setShowServerForm] = useState(false);
    const [editingServerId, setEditingServerId] = useState<string | null>(null);

    const [grantForm, setGrantForm] = useState({ userId: '', badgeId: '' });

    const iconOptions = ['Shield', 'Award', 'Star', 'Heart', 'Code', 'Bug', 'Gift', 'Crown', 'Trophy', 'Globe'];

    // Permissions Check
    useEffect(() => {
        const check = async () => {
            if (authRole === 'admin' || authRole === 'developer') {
                setIsAdmin(true);
                await loadData();
                setLoading(false);
                return;
            }

            const adminStatus = await ProfileService.isAdmin(user.uuid);
            setIsAdmin(adminStatus);
            if (adminStatus) await loadData();
            setLoading(false);
        };
        check();
    }, [user.uuid, authRole]);

    const loadData = async () => {
        const [badgesData, usersData, serversData] = await Promise.all([
            ProfileService.getAllBadges(),
            ProfileService.getAllUsers(),
            ServerService.getFeaturedServers()
        ]);
        setBadges(badgesData);
        setUsers(usersData);
        setFeaturedServers(serversData);
        await Promise.all([loadNews(), loadChangelogs()]);
    };

    const loadNews = async () => {
        const { data } = await supabase.from('news').select('*').order('created_at', { ascending: false });
        setNews(data || []);
    };

    const loadChangelogs = async () => {
        const result = await ContentManager.fetchChangelogs();
        setChangelogs(result.items);
    };

    // Server Handlers
    const handleSaveServer = async () => {
        if (!serverForm.name || !serverForm.address) return showToast('Name and Address are required', 'error');

        if (editingServerId) {
            const success = await ServerService.updateServer(editingServerId, serverForm);
            if (success) {
                showToast('Server updated', 'success');
                setFeaturedServers(featuredServers.map(s => s.id === editingServerId ? { ...s, ...serverForm } as FeaturedServer : s));
                resetServerForm();
            }
        } else {
            const newServer = await ServerService.addServer(serverForm as any);
            if (newServer) {
                showToast('Server added', 'success');
                setFeaturedServers([newServer, ...featuredServers]);
                resetServerForm();
            }
        }
    };

    const handleEditServer = (server: FeaturedServer) => {
        setServerForm(server);
        setEditingServerId(server.id);
        setShowServerForm(true);
    };

    const handleDeleteServer = async (id: string) => {
        if (await confirm('Delete Server', 'Are you sure you want to remove this server?')) {
            const success = await ServerService.deleteServer(id);
            if (success) {
                setFeaturedServers(featuredServers.filter(s => s.id !== id));
                showToast('Server removed', 'success');
            }
        }
    };

    const resetServerForm = () => {
        setServerForm({ name: '', address: '', icon_url: '', banner_url: '', description: '' });
        setEditingServerId(null);
        setShowServerForm(false);
    };

    // Badge Handlers
    const handleCreateBadge = async () => {
        if (!newBadge.name || !newBadge.description) return showToast('Fill all fields', 'error');

        if (await confirm('Create Badge', `Are you sure you want to create "${newBadge.name}"?`)) {
            const result = await ProfileService.createBadge(newBadge);
            if (result) {
                showToast('Badge created!', 'success');
                setBadges([...badges, result]);
                setNewBadge({ name: '', description: '', icon: 'Shield', color: '#ff9f43' });
                setShowBadgeForm(false);
            } else {
                showToast('Failed to create badge', 'error');
            }
        }
    };

    const handleGrantBadge = async () => {
        if (!grantForm.userId || !grantForm.badgeId) return showToast('Select user and badge', 'error');

        const badgeName = badges.find(b => b.id === grantForm.badgeId)?.name;
        const userName = users.find(u => u.id === grantForm.userId)?.username;

        if (await confirm('Grant Badge', `Grant "${badgeName}" to ${userName}?`)) {
            const success = await ProfileService.grantBadge(grantForm.userId, grantForm.badgeId, user.uuid);
            if (success) {
                showToast('Badge granted!', 'success');
                setGrantForm({ userId: '', badgeId: '' });
            } else {
                showToast('Failed to grant', 'error');
            }
        }
    };

    // User Handlers
    const handleBanUser = async (userId: string, currentBanned: boolean) => {
        if (currentBanned) {
            if (await confirm('Unban User', 'Are you sure you want to unban this user?')) {
                const success = await ProfileService.setUserBan(userId, false);
                if (success) {
                    showToast('User unbanned', 'success');
                    setUsers(users.map(u => u.id === userId ? { ...u, banned: false, ban_reason: undefined } : u));
                }
            }
        } else {
            const reason = await prompt('Ban User', 'Please enter a reason for the ban:', {
                inputConfig: { placeholder: 'Violation of terms...', defaultValue: 'Violation of rules' },
                isDanger: true,
                confirmLabel: 'Ban User'
            });

            if (reason) {
                const success = await ProfileService.setUserBan(userId, true, reason);
                if (success) {
                    showToast('User banned', 'success');
                    setUsers(users.map(u => u.id === userId ? { ...u, banned: true, ban_reason: reason } : u));
                }
            }
        }
    };

    const handleRoleChange = async (userId: string, newRole: 'user' | 'admin' | 'developer') => {
        const userName = users.find(u => u.id === userId)?.username;
        if (await confirm('Change Role', `Change ${userName}'s role to ${newRole}? This grants powerful permissions.`, { isDanger: newRole !== 'user' })) {
            const success = await ProfileService.setUserRole(userId, newRole);
            if (success) {
                showToast('Role updated', 'success');
                setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
            }
        }
    };

    // News Handlers
    const handleCreateNews = async () => {
        if (!newNews.title || !newNews.content) return showToast('Fill all fields', 'error');

        const { data, error } = await supabase.from('news').insert({
            ...newNews,
            author_id: user.uuid,
            published: true
        }).select().single();

        if (error) {
            showToast('Failed to post news', 'error');
        } else {
            showToast('News published!', 'success');
            setNews([data, ...news]);
            setNewNews({ title: '', content: '', category: 'update', image_url: '', color: '#ff8800', version: '' });
            setShowNewsForm(false);
        }
    };

    const handleDeleteNews = async (id: string) => {
        if (await confirm('Delete News', 'Are you sure? This cannot be undone.', { isDanger: true })) {
            const { error } = await supabase.from('news').delete().eq('id', id);
            if (!error) {
                setNews(news.filter(n => n.id !== id));
                showToast('News deleted', 'success');
            }
        }
    };

    // Changelog Handlers
    const handleCreateChangelog = async () => {
        if (!newChangelog.version || !newChangelog.description) return showToast('Fill all fields', 'error');

        const result = await ContentManager.createChangelog(newChangelog);
        if (result) {
            showToast('Changelog posted!', 'success');
            setChangelogs([result, ...changelogs]);
            setNewChangelog({ version: '', description: '', type: 'release' });
            setShowChangelogForm(false);
        } else {
            showToast('Failed to post changelog', 'error');
        }
    };

    const handleDeleteChangelog = async (id: string) => {
        if (await confirm('Delete Changelog', 'Are you sure?', { isDanger: true })) {
            const success = await ContentManager.deleteChangelog(id);
            if (success) {
                setChangelogs(changelogs.filter(c => c.id !== id));
                showToast('Changelog deleted', 'success');
            }
        }
    };

    if (loading) return (
        <div className={styles.container}>
            <div className={styles.loading}>Loading Admin Panel...</div>
        </div>
    );

    if (!isAdmin) return (
        <div className={styles.container}>
            <div className={styles.accessDenied}>
                <Shield size={64} color="#ff4757" />
                <h2>Access Restricted</h2>
                <p>Protected Area. Only authorized personnel allowed.</p>
            </div>
        </div>
    );

    const renderTabContent = () => {
        switch (activeTab) {
            case 'overview':
                return (
                    <>
                        <PageHeader title="Dashboard Overview" description="Welcome to the control center." />

                        {/* Quick Stats */}
                        <div className={styles.overviewGrid}>
                            <div className={styles.statCard}>
                                <div className={styles.statIcon} style={{ background: 'rgba(255, 136, 0, 0.1)', color: '#ff8800' }}>
                                    <Users size={24} />
                                </div>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue}>{users.length}</div>
                                    <div className={styles.statLabel}>Total Users</div>
                                </div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={styles.statIcon} style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#3498db' }}>
                                    <Server size={24} />
                                </div>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue}>{featuredServers.length}</div>
                                    <div className={styles.statLabel}>Featured Servers</div>
                                </div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={styles.statIcon} style={{ background: 'rgba(155, 89, 182, 0.1)', color: '#9b59b6' }}>
                                    <Award size={24} />
                                </div>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue}>{badges.length}</div>
                                    <div className={styles.statLabel}>Badges Created</div>
                                </div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={styles.statIcon} style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#2ecc71' }}>
                                    <Zap size={24} />
                                </div>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue}>{import.meta.env.VITE_APP_VERSION || '3.0.0'}</div>
                                    <div className={styles.statLabel}>System Version</div>
                                </div>
                            </div>
                        </div>

                        {/* Quick Actions */}
                        <div className={styles.sectionTitleSmall}>Quick Actions</div>
                        <div className={styles.quickActions}>
                            <div className={styles.quickActionCard} onClick={() => setActiveTab('users')}>
                                <div className={styles.quickActionIcon} style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#3498db' }}>
                                    <User size={20} />
                                </div>
                                <div>
                                    <div className={styles.quickActionTitle}>Manage Users</div>
                                    <div className={styles.quickActionDesc}>View and manage user accounts</div>
                                </div>
                            </div>
                            <div className={styles.quickActionCard} onClick={() => setActiveTab('servers')}>
                                <div className={styles.quickActionIcon} style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#2ecc71' }}>
                                    <Server size={20} />
                                </div>
                                <div>
                                    <div className={styles.quickActionTitle}>Featured Servers</div>
                                    <div className={styles.quickActionDesc}>Manage server listings</div>
                                </div>
                            </div>
                            <div className={styles.quickActionCard} onClick={() => setActiveTab('content')}>
                                <div className={styles.quickActionIcon} style={{ background: 'rgba(155, 89, 182, 0.1)', color: '#9b59b6' }}>
                                    <FileText size={20} />
                                </div>
                                <div>
                                    <div className={styles.quickActionTitle}>News & Updates</div>
                                    <div className={styles.quickActionDesc}>Publish announcements</div>
                                </div>
                            </div>
                            <div className={styles.quickActionCard} onClick={() => setActiveTab('badges')}>
                                <div className={styles.quickActionIcon} style={{ background: 'rgba(241, 196, 15, 0.1)', color: '#f1c40f' }}>
                                    <Medal size={20} />
                                </div>
                                <div>
                                    <div className={styles.quickActionTitle}>Badge System</div>
                                    <div className={styles.quickActionDesc}>Create and grant badges</div>
                                </div>
                            </div>
                        </div>
                    </>
                );

            case 'users':
                return (
                    <>
                        <PageHeader title="User Management" description="Manage user roles, bans, and permissions." />

                        <div className={styles.grid}>
                            {users.map(u => (
                                <div key={u.id} className={`${styles.userCard} ${u.banned ? styles.banned : ''}`}>
                                    <div className={styles.userAvatar}>
                                        <UserAvatar
                                            username={u.username}
                                            uuid={u.id}
                                            accountType="yashin"
                                            className={styles.avatarImg}
                                        />
                                    </div>
                                    <div className={styles.cardContent}>
                                        <span className={styles.cardTitle}>
                                            {u.username}
                                            {u.banned && <span className={styles.banTag}>BANNED</span>}
                                            {u.role === 'admin' && <span className={styles.badgeTag} style={{ marginLeft: 8, background: 'rgba(231, 76, 60, 0.2)', color: '#e74c3c' }}>ADMIN</span>}
                                            {u.role === 'developer' && <span className={styles.badgeTag} style={{ marginLeft: 8, background: 'rgba(52, 152, 219, 0.2)', color: '#3498db' }}>DEV</span>}
                                        </span>
                                        <span className={styles.cardSub}>{u.email || 'No email'} • Joined {new Date(u.joined_at || Date.now()).toLocaleDateString()}</span>
                                    </div>
                                    <div className={styles.cardActions}>
                                        <select
                                            className={styles.roleSelect}
                                            value={u.role}
                                            onChange={(e) => handleRoleChange(u.id, e.target.value as any)}
                                        >
                                            <option value="user">User</option>
                                            <option value="admin">Admin</option>
                                            <option value="developer">Developer</option>
                                        </select>
                                        <button
                                            className={`${styles.iconBtn} ${u.banned ? '' : styles.danger}`}
                                            title={u.banned ? "Unban" : "Ban"}
                                            onClick={() => handleBanUser(u.id, u.banned || false)}
                                        >
                                            {u.banned ? <UserCheck size={18} /> : <Ban size={18} />}
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                );

            case 'servers':
                return (
                    <>
                        <div className={styles.sectionHeader}>
                            <PageHeader title="Featured Servers" description="Drag to reorder. Manage servers promoted on the home page." />
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className={styles.actionBtnSecondary} onClick={() => ServerService.reorderServers(featuredServers.map(s => s.id))
                                    .then(() => showToast('Order saved!', 'success'))}>
                                    <Save size={18} /> Save Order
                                </button>
                                <button className={styles.actionBtn} onClick={() => { resetServerForm(); setShowServerForm(true); }}>
                                    <Plus size={18} /> Add Server
                                </button>
                            </div>
                        </div>

                        {showServerForm && (
                            <div className={styles.formCard}>
                                <div className={styles.sectionTitle}>
                                    {editingServerId ? 'Edit Server' : 'Add New Server'}
                                </div>
                                <div className={styles.formGrid}>
                                    <input className={styles.input} placeholder="Server Name" value={serverForm.name} onChange={e => setServerForm({ ...serverForm, name: e.target.value })} />
                                    <input className={styles.input} placeholder="Address (IP)" value={serverForm.address} onChange={e => setServerForm({ ...serverForm, address: e.target.value })} />
                                </div>
                                <div className={styles.formGrid}>
                                    <input className={styles.input} placeholder="Icon URL (Optional)" value={serverForm.icon_url} onChange={e => setServerForm({ ...serverForm, icon_url: e.target.value })} />
                                    <input className={styles.input} placeholder="Banner URL (Optional)" value={serverForm.banner_url} onChange={e => setServerForm({ ...serverForm, banner_url: e.target.value })} />
                                </div>
                                <textarea className={styles.textarea} rows={3} placeholder="Description (Optional)" value={serverForm.description} onChange={e => setServerForm({ ...serverForm, description: e.target.value })} />
                                <div className={styles.formActions}>
                                    <button className={styles.cancelBtn} onClick={() => setShowServerForm(false)}>Cancel</button>
                                    <button className={styles.saveBtn} onClick={handleSaveServer}><Save size={16} /> Save Server</button>
                                </div>
                            </div>
                        )}

                        <div className={styles.grid}>
                            {featuredServers.length === 0 && <div className={styles.emptyState}>No featured servers active.</div>}
                            {featuredServers.map((server, index) => (
                                <div
                                    key={server.id}
                                    className={styles.card}
                                    draggable
                                    onDragStart={(e) => {
                                        e.dataTransfer.effectAllowed = 'move';
                                        e.dataTransfer.setData('text/plain', index.toString());
                                    }}
                                    onDragOver={(e) => {
                                        e.preventDefault();
                                        e.dataTransfer.dropEffect = 'move';
                                    }}
                                    onDrop={(e) => {
                                        e.preventDefault();
                                        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
                                        const toIndex = index;
                                        if (fromIndex === toIndex) return;

                                        const newServers = [...featuredServers];
                                        const [moved] = newServers.splice(fromIndex, 1);
                                        newServers.splice(toIndex, 0, moved);
                                        setFeaturedServers(newServers);
                                    }}
                                    style={{ cursor: 'grab' }}
                                >
                                    <div className={styles.cardIcon}>
                                        {server.icon_url ? <img src={server.icon_url} alt="icon" /> : <Globe size={24} />}
                                    </div>
                                    <div className={styles.cardContent}>
                                        <span className={styles.cardTitle}>
                                            {index + 1}. {server.name}
                                        </span>
                                        <span className={styles.cardSub}>{server.address} • {server.description || 'No description'}</span>
                                    </div>
                                    <div className={styles.cardActions}>
                                        <button className={styles.iconBtn} onClick={() => handleEditServer(server)}>
                                            <Edit2 size={16} />
                                        </button>
                                        <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => handleDeleteServer(server.id)}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                );

            case 'badges':
                return (
                    <>
                        <div className={styles.sectionHeader}>
                            <PageHeader title="Badge Management" description="Create and grant badges to users." />
                            <button className={styles.actionBtn} onClick={() => setShowBadgeForm(!showBadgeForm)}>
                                <Plus size={18} /> {showBadgeForm ? 'Cancel' : 'New Badge'}
                            </button>
                        </div>

                        {showBadgeForm && (
                            <div className={styles.formCard}>
                                <div className={styles.sectionTitle}>Create New Badge</div>
                                <div className={styles.formGrid}>
                                    <input className={styles.input} placeholder="Name" value={newBadge.name} onChange={e => setNewBadge({ ...newBadge, name: e.target.value })} />
                                    <input className={styles.input} placeholder="Description" value={newBadge.description} onChange={e => setNewBadge({ ...newBadge, description: e.target.value })} />
                                </div>
                                <div className={styles.formGrid}>
                                    <CustomSelect
                                        value={newBadge.icon}
                                        onChange={(val) => setNewBadge({ ...newBadge, icon: val })}
                                        options={iconOptions.map(i => ({ value: i, label: i }))}
                                        placeholder="Select Icon"
                                    />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ color: '#888', fontSize: '14px' }}>Color:</span>
                                        <input type="color" className={styles.colorPicker} value={newBadge.color} onChange={e => setNewBadge({ ...newBadge, color: e.target.value })} />
                                    </div>
                                </div>
                                <button className={styles.actionBtn} onClick={handleCreateBadge} style={{ marginTop: 16 }}>
                                    <Save size={16} /> Save Badge
                                </button>
                            </div>
                        )}

                        {/* Grant Badge Section */}
                        <div className={styles.formCard} style={{ marginBottom: 24 }}>
                            <div className={styles.sectionTitle}>Grant Badge to User</div>
                            <div className={styles.formGrid}>
                                <CustomSelect
                                    value={grantForm.userId}
                                    onChange={(val) => setGrantForm({ ...grantForm, userId: val })}
                                    options={users.map(u => ({ value: u.id, label: u.username }))}
                                    placeholder="Select User"
                                />
                                <CustomSelect
                                    value={grantForm.badgeId}
                                    onChange={(val) => setGrantForm({ ...grantForm, badgeId: val })}
                                    options={badges.map(b => ({ value: b.id, label: b.name }))}
                                    placeholder="Select Badge"
                                />
                            </div>
                            <button className={styles.actionBtn} onClick={handleGrantBadge} style={{ marginTop: 16 }}>
                                <Award size={16} /> Grant Badge
                            </button>
                        </div>

                        {/* Badge List */}
                        <div className={styles.sectionTitleSmall}>All Badges</div>
                        <div className={styles.grid}>
                            {badges.map(badge => {
                                const IconComponent = getIconComponent(badge.icon);
                                return (
                                    <div key={badge.id} className={styles.card}>
                                        <div className={styles.cardIcon} style={{ background: `${badge.color}20` }}>
                                            <IconComponent size={24} color={badge.color} />
                                        </div>
                                        <div className={styles.cardContent}>
                                            <span className={styles.badgePreview} style={{ borderColor: badge.color, color: badge.color }}>
                                                {badge.name}
                                            </span>
                                            <span className={styles.cardSub}>{badge.description}</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                );

            case 'content':
                return (
                    <>
                        <div className={styles.sectionHeader}>
                            <PageHeader title="News & Updates" description="Publish news articles and changelogs." />
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button className={styles.actionBtnSecondary} onClick={() => { setShowChangelogForm(!showChangelogForm); setShowNewsForm(false); }}>
                                    <GitBranch size={18} /> Changelog
                                </button>
                                <button className={styles.actionBtn} onClick={() => { setShowNewsForm(!showNewsForm); setShowChangelogForm(false); }}>
                                    <Plus size={18} /> New Post
                                </button>
                            </div>
                        </div>

                        {showNewsForm && (
                            <div className={styles.formCard}>
                                <div className={styles.sectionTitle}>Create News Post</div>
                                <div className={styles.formGrid}>
                                    <input className={styles.input} placeholder="Title" value={newNews.title} onChange={e => setNewNews({ ...newNews, title: e.target.value })} />
                                    <CustomSelect
                                        value={newNews.category}
                                        onChange={(val) => setNewNews({ ...newNews, category: val })}
                                        options={[
                                            { value: 'update', label: 'Update' },
                                            { value: 'feature', label: 'Feature' },
                                            { value: 'bugfix', label: 'Bug Fix' },
                                            { value: 'announcement', label: 'Announcement' },
                                        ]}
                                    />
                                </div>
                                <textarea className={styles.textarea} rows={6} placeholder="Content (Markdown supported)" value={newNews.content} onChange={e => setNewNews({ ...newNews, content: e.target.value })} />
                                <div className={styles.formGrid} style={{ marginTop: 16 }}>
                                    {newNews.category === 'update' && (
                                        <input className={styles.input} placeholder="Version (e.g. v1.0.5)" value={newNews.version} onChange={e => setNewNews({ ...newNews, version: e.target.value })} />
                                    )}
                                    <input className={styles.input} placeholder="Image URL (optional)" value={newNews.image_url} onChange={e => setNewNews({ ...newNews, image_url: e.target.value })} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span style={{ color: '#888', fontSize: '14px' }}>Accent:</span>
                                        <input type="color" className={styles.colorPicker} value={newNews.color} onChange={e => setNewNews({ ...newNews, color: e.target.value })} />
                                    </div>
                                </div>
                                <button className={styles.actionBtn} style={{ marginTop: 16 }} onClick={handleCreateNews}>
                                    <Save size={16} /> Publish Post
                                </button>
                            </div>
                        )}

                        {showChangelogForm && (
                            <div className={styles.formCard}>
                                <div className={styles.sectionTitle}>Create Changelog Entry</div>
                                <div className={styles.formGrid}>
                                    <input className={styles.input} placeholder="Version (e.g. 1.0.2)" value={newChangelog.version} onChange={e => setNewChangelog({ ...newChangelog, version: e.target.value })} />
                                    <CustomSelect
                                        value={newChangelog.type}
                                        onChange={(val) => setNewChangelog({ ...newChangelog, type: val as any })}
                                        options={[
                                            { value: 'release', label: 'Release' },
                                            { value: 'beta', label: 'Beta' },
                                            { value: 'hotfix', label: 'Hotfix' },
                                        ]}
                                    />
                                </div>
                                <textarea className={styles.textarea} rows={4} placeholder="Description (Markdown supported)" value={newChangelog.description} onChange={e => setNewChangelog({ ...newChangelog, description: e.target.value })} />
                                <button className={styles.actionBtn} style={{ marginTop: 16 }} onClick={handleCreateChangelog}>
                                    <Save size={16} /> Save Changelog
                                </button>
                            </div>
                        )}

                        {/* News List */}
                        <div className={styles.sectionTitleSmall}>News Articles ({news.length})</div>
                        <div className={styles.grid}>
                            {news.length === 0 && <div className={styles.emptyState}>No news articles yet.</div>}
                            {news.map(item => (
                                <div key={item.id} className={styles.newsCard} style={{ borderLeftColor: item.color || '#ff8800' }}>
                                    <div className={styles.cardContent}>
                                        <span className={styles.cardTitle}>{item.title}</span>
                                        <span className={styles.cardSub}>
                                            <span className={styles.typeTag}>{item.category}</span>
                                            {' • '}
                                            {new Date(item.created_at).toLocaleDateString()}
                                        </span>
                                    </div>
                                    <div className={styles.cardActions}>
                                        <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => handleDeleteNews(item.id)}>
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Changelog List */}
                        <div className={styles.sectionTitleSmall} style={{ marginTop: 32 }}>Changelogs ({changelogs.length})</div>
                        <div className={styles.grid}>
                            {changelogs.length === 0 && <div className={styles.emptyState}>No changelogs yet.</div>}
                            {changelogs.map(log => (
                                <div key={log.id} className={styles.card}>
                                    <div className={styles.cardContent}>
                                        <span className={styles.cardTitle}>
                                            v{log.version}
                                            <span className={styles.typeTag} style={{ marginLeft: 8 }}>{log.type}</span>
                                        </span>
                                        <span className={styles.cardSub}>{new Date(log.date).toLocaleDateString()}</span>
                                    </div>
                                    <div className={styles.cardActions}>
                                        <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => handleDeleteChangelog(log.id)}>
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                );

            case 'system':
                return (
                    <>
                        <PageHeader title="System Configuration" description="Manage global settings and view system information." />

                        <div className={styles.systemSection}>
                            <div className={styles.sectionTitle}>
                                <Settings size={20} style={{ color: '#ff8800' }} />
                                Application Version
                            </div>
                            <div className={styles.versionDisplay}>
                                <div style={{
                                    width: 64,
                                    height: 64,
                                    borderRadius: 16,
                                    background: 'linear-gradient(135deg, rgba(255, 136, 0, 0.2), rgba(255, 170, 0, 0.1))',
                                    border: '1px solid rgba(255, 136, 0, 0.3)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <Zap size={32} color="#ff8800" />
                                </div>
                                <div>
                                    <div className={styles.versionLabel}>Current Version</div>
                                    <div className={styles.versionValue}>{import.meta.env.VITE_APP_VERSION || '3.0.0'}</div>
                                </div>
                            </div>
                            <p style={{ color: '#888', fontSize: '14px', marginTop: 20, lineHeight: 1.6 }}>
                                The application version is managed through package.json and GitHub releases.
                                Updates are distributed through the auto-updater system.
                            </p>
                        </div>
                    </>
                );

            default:
                return null;
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.content}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerIcon}>
                        <Shield size={28} color="#ff8800" />
                    </div>
                    <div className={styles.headerInfo}>
                        <h2 className={styles.headerTitle}>Admin Panel</h2>
                        <span className={styles.headerSub}>Welcome back, {user.name}</span>
                    </div>
                </div>

                {/* Tabs */}
                <div className={styles.tabs}>
                    <button className={`${styles.tab} ${activeTab === 'overview' ? styles.active : ''}`} onClick={() => setActiveTab('overview')}>
                        <LayoutDashboard size={18} /> Overview
                    </button>
                    <button className={`${styles.tab} ${activeTab === 'users' ? styles.active : ''}`} onClick={() => setActiveTab('users')}>
                        <Users size={18} /> Users
                    </button>
                    <button className={`${styles.tab} ${activeTab === 'servers' ? styles.active : ''}`} onClick={() => setActiveTab('servers')}>
                        <Server size={18} /> Servers
                    </button>
                    <button className={`${styles.tab} ${activeTab === 'badges' ? styles.active : ''}`} onClick={() => setActiveTab('badges')}>
                        <Award size={18} /> Badges
                    </button>
                    <button className={`${styles.tab} ${activeTab === 'content' ? styles.active : ''}`} onClick={() => setActiveTab('content')}>
                        <Newspaper size={18} /> Content
                    </button>
                    <button className={`${styles.tab} ${activeTab === 'system' ? styles.active : ''}`} onClick={() => setActiveTab('system')}>
                        <Settings size={18} /> System
                    </button>
                </div>

                {/* Tab Content */}
                {renderTabContent()}
            </div>
        </div>
    );
};
