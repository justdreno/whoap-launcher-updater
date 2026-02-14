import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';
import styles from './Admin.module.css';
import { Shield, Users, Newspaper, Award, Plus, Trash2, Ban, UserCheck, Save, LayoutDashboard, Settings, GitBranch, Server, Globe, Edit2, Zap, Bell, Download } from 'lucide-react';
import { ProfileService, UserProfile, Badge as BadgeType } from '../services/ProfileService';
import { ServerService, FeaturedServer } from '../services/ServerService';
import { supabase } from '../lib/supabase';
import { useToast } from '../context/ToastContext';
import { useConfirm, usePrompt } from '../context/ConfirmContext';
import { useAuth } from '../context/AuthContext';
import { CustomSelect } from '../components/CustomSelect';
import { SystemService } from '../services/SystemService';
import { ContentManager, ChangelogItem } from '../utils/ContentManager';

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

export const Admin: React.FC<AdminProps> = ({ user: propUser }) => {
    const { role: authRole, profile: authProfile } = useAuth();
    // Use auth context profile if available (realtime), otherwise prop
    const user = {
        name: authProfile?.username || propUser.name,
        uuid: authProfile?.id || propUser.uuid,
        role: authRole || propUser.role
    };

    // State definitions
    const [activeSection, setActiveSection] = useState<'overview' | 'servers' | 'badges' | 'users' | 'news' | 'system' | 'announcements'>('overview');
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
    const [currentVersion, setCurrentVersion] = useState('');
    const [newVersion, setNewVersion] = useState('');

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

    // Announcement form state
    const [announcements, setAnnouncements] = useState<any[]>([]);
    const [newUpdate, setNewUpdate] = useState({
        version: '',
        downloadUrl: '',
        buttonTitle: 'Update Now',
        message: '',
        priority: 'normal' as 'low' | 'normal' | 'high' | 'critical'
    });

    // Permissions Check
    useEffect(() => {
        const check = async () => {
            // Instant check from context
            if (authRole === 'admin' || authRole === 'developer') {
                setIsAdmin(true);
                await loadData();
                setLoading(false);
                return;
            }

            // Fallback fetch (e.g. if context is slow or initial load)
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
        await Promise.all([loadNews(), loadChangelogs(), loadSystemConfig(), loadAnnouncements()]);
    };

    const loadNews = async () => {
        const { data } = await supabase.from('news').select('*').order('created_at', { ascending: false });
        setNews(data || []);
    };

    const loadChangelogs = async () => {
        const result = await ContentManager.fetchChangelogs();
        setChangelogs(result.items);
    };

    const loadAnnouncements = async () => {
        const items = await SystemService.getAllUpdateAnnouncements();
        setAnnouncements(items);
    };

    const loadSystemConfig = async () => {
        const version = await SystemService.getAppVersion();
        setCurrentVersion(version);
        setNewVersion(version);
    };

    // --- Server Handlers ---
    const handleSaveServer = async () => {
        if (!serverForm.name || !serverForm.address) return showToast('Name and Address are required', 'error');

        if (editingServerId) {
            // Update
            const success = await ServerService.updateServer(editingServerId, serverForm);
            if (success) {
                showToast('Server updated', 'success');
                setFeaturedServers(featuredServers.map(s => s.id === editingServerId ? { ...s, ...serverForm } as FeaturedServer : s));
                resetServerForm();
            }
        } else {
            // Create
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

    // --- Badge Handlers ---
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

    // --- User Handlers ---
    const handleBanUser = async (userId: string, currentBanned: boolean) => {
        if (currentBanned) {
            // Unban
            if (await confirm('Unban User', 'Are you sure you want to unban this user?')) {
                const success = await ProfileService.setUserBan(userId, false);
                if (success) {
                    showToast('User unbanned', 'success');
                    setUsers(users.map(u => u.id === userId ? { ...u, banned: false, ban_reason: undefined } : u));
                }
            }
        } else {
            // Ban
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

    // --- News Handlers ---
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

    // --- System Handlers ---
    const handleUpdateVersion = async () => {
        if (!newVersion) return;
        if (await confirm('Update Application Version', `Are you sure you want to change the version from v${currentVersion} to v${newVersion}? This will affect all users.`)) {
            const success = await SystemService.updateAppVersion(newVersion, user.uuid);
            if (success) {
                setCurrentVersion(newVersion);
                showToast('Version updated successfully!', 'success');
            } else {
                showToast('Failed to update version', 'error');
            }
        }
    };

    // --- Changelog Handlers ---
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

    // --- Update Announcement Handlers ---
    const handleCreateUpdate = async () => {
        if (!newUpdate.version || !newUpdate.downloadUrl) {
            showToast('Version and Download URL are required', 'error');
            return;
        }

        const success = await SystemService.createUpdateAnnouncement(
            newUpdate.version,
            newUpdate.downloadUrl,
            newUpdate.buttonTitle,
            newUpdate.message || undefined,
            newUpdate.priority
        );

        if (success) {
            showToast('Update announcement created!', 'success');
            loadAnnouncements();
            setNewUpdate({ version: '', downloadUrl: '', buttonTitle: 'Update Now', message: '', priority: 'normal' });
        } else {
            showToast('Failed to create update', 'error');
        }
    };

    const handleDeleteUpdate = async (id: string) => {
        if (await confirm('Delete Update', 'Are you sure?')) {
            const success = await SystemService.deleteUpdateAnnouncement(id);
            if (success) {
                setAnnouncements(announcements.filter(a => a.id !== id));
                showToast('Update deleted', 'success');
            }
        }
    };

    if (loading) return <div className={styles.loading}>Loading Admin Panel...</div>;
    if (!isAdmin) return (
        <div className={styles.container}>
            <div className={styles.accessDenied}>
                <Shield size={64} color="#ff4757" />
                <h2>Access Restricted</h2>
                <p>Protected Area. Only authorized personnel allowed.</p>
            </div>
        </div>
    );

    const iconOptions = ['Shield', 'Gift', 'Code', 'Heart', 'Bug', 'Star', 'Award', 'Crown'];

    return (
        <div className={styles.container}>
            {/* Sidebar Navigation */}
            <div className={styles.sidebar}>
                <div className={styles.header}>
                    <div className={styles.headerIcon}>
                        <Shield size={24} color="#ff8800" />
                    </div>
                    <div>
                        <h2 className={styles.headerTitle}>Admin Panel</h2>
                        <span className={styles.headerSub}>{user.name}</span>
                    </div>
                </div>

                <div className={styles.navGroup}>
                    <span className={styles.navLabel}>Management</span>
                    <nav className={styles.nav}>
                        <button className={`${styles.navItem} ${activeSection === 'overview' ? styles.active : ''}`} onClick={() => setActiveSection('overview')}>
                            <LayoutDashboard size={18} /> Overview
                        </button>
                        <button className={`${styles.navItem} ${activeSection === 'users' ? styles.active : ''}`} onClick={() => setActiveSection('users')}>
                            <Users size={18} /> Users & Roles
                        </button>
                    </nav>
                </div>

                <div className={styles.navGroup}>
                    <span className={styles.navLabel}>Content</span>
                    <nav className={styles.nav}>
                        <button className={`${styles.navItem} ${activeSection === 'servers' ? styles.active : ''}`} onClick={() => setActiveSection('servers')}>
                            <Server size={18} /> Featured Servers
                        </button>
                        <button className={`${styles.navItem} ${activeSection === 'badges' ? styles.active : ''}`} onClick={() => setActiveSection('badges')}>
                            <Award size={18} /> Badges
                        </button>
                        <button className={`${styles.navItem} ${activeSection === 'news' ? styles.active : ''}`} onClick={() => setActiveSection('news')}>
                            <Newspaper size={18} /> News & Updates
                        </button>
                    </nav>
                </div>

                <div className={styles.navGroup}>
                    <span className={styles.navLabel}>System</span>
                    <nav className={styles.nav}>
                        <button className={`${styles.navItem} ${activeSection === 'system' ? styles.active : ''}`} onClick={() => setActiveSection('system')}>
                            <Settings size={18} /> Configuration
                        </button>
                        <button className={`${styles.navItem} ${activeSection === 'announcements' ? styles.active : ''}`} onClick={() => setActiveSection('announcements')}>
                            <Bell size={18} /> Announcements
                        </button>
                    </nav>
                </div>
            </div>

            {/* Main Content */}
            <div className={styles.content}>

                {activeSection === 'overview' && (
                    <>
                        <PageHeader title="Dashboard Overview" description="Welcome to the control center." />
                        <div className={styles.overviewGrid}>
                            <div className={styles.statCard}>
                                <div className={styles.statIcon} style={{ background: 'rgba(255, 136, 0, 0.1)', color: '#ff8800' }}><Users size={24} /></div>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue}>{users.length}</div>
                                    <div className={styles.statLabel}>Total Users</div>
                                </div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={styles.statIcon} style={{ background: 'rgba(52, 152, 219, 0.1)', color: '#3498db' }}><Server size={24} /></div>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue}>{featuredServers.length}</div>
                                    <div className={styles.statLabel}>Featured Servers</div>
                                </div>
                            </div>
                            <div className={styles.statCard}>
                                <div className={styles.statIcon} style={{ background: 'rgba(46, 204, 113, 0.1)', color: '#2ecc71' }}><Zap size={24} /></div>
                                <div className={styles.statInfo}>
                                    <div className={styles.statValue}>v{currentVersion}</div>
                                    <div className={styles.statLabel}>System Version</div>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {activeSection === 'servers' && (
                    <>
                        <div className={styles.sectionHeader}>
                            <PageHeader title="Featured Servers" description="Drag to reorder. Manage servers promoted on the home page." />
                            <div style={{ display: 'flex', gap: 10 }}>
                                <button className={styles.actionBtn} onClick={() => ServerService.reorderServers(featuredServers.map(s => s.id))
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
                                <h3>{editingServerId ? 'Edit Server' : 'Add New Server'}</h3>
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
                )}

                {activeSection === 'badges' && (
                    <>
                        <div className={styles.sectionHeader}>
                            <PageHeader title="Badge Management" description="Create and grant badges to users." />
                            <button className={styles.actionBtn} onClick={() => setShowBadgeForm(!showBadgeForm)}>
                                <Plus size={18} /> New Badge
                            </button>
                        </div>

                        {showBadgeForm && (
                            <div className={styles.formCard}>
                                <h3>Create New Badge</h3>
                                <div className={styles.formGrid}>
                                    <input className={styles.input} placeholder="Name" value={newBadge.name} onChange={e => setNewBadge({ ...newBadge, name: e.target.value })} />
                                    <input className={styles.input} placeholder="Description" value={newBadge.description} onChange={e => setNewBadge({ ...newBadge, description: e.target.value })} />
                                </div>
                                <div className={styles.formGrid}>
                                    <CustomSelect
                                        value={newBadge.icon}
                                        onChange={(val) => setNewBadge({ ...newBadge, icon: val })}
                                        options={iconOptions.map(i => ({ value: i, label: i, icon: <Shield size={14} /> }))} // Simple icon mapping for now
                                        placeholder="Select Icon"
                                    />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span>Color:</span>
                                        <input type="color" className={styles.colorPicker} value={newBadge.color} onChange={e => setNewBadge({ ...newBadge, color: e.target.value })} />
                                    </div>
                                </div>
                                <button className={styles.actionBtn} onClick={handleCreateBadge}><Save size={16} /> Save Badge</button>
                            </div>
                        )}

                        <div className={styles.grid}>
                            {/* Grant Section */}
                            <div className={styles.card}>
                                <div className={styles.cardContent}>
                                    <span className={styles.cardTitle}>Grant Badges</span>
                                    <div className={styles.formGrid} style={{ marginTop: 10, marginBottom: 0 }}>
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
                                </div>
                                <div className={styles.cardActions}>
                                    <button className={styles.actionBtn} style={{ background: '#222', color: 'white', border: '1px solid #444' }} onClick={handleGrantBadge}>Grant</button>
                                </div>
                            </div>

                            {badges.map(badge => (
                                <div key={badge.id} className={styles.card}>
                                    <div className={styles.cardContent}>
                                        <span className={styles.badgePreview} style={{ borderColor: badge.color, color: badge.color }}>
                                            {badge.name}
                                        </span>
                                        <span className={styles.cardSub} style={{ marginLeft: 10 }}>{badge.description}</span>
                                    </div>
                                    <div className={styles.cardActions}>
                                        <button className={`${styles.iconBtn} ${styles.danger}`}><Trash2 size={16} /></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {activeSection === 'users' && (
                    <>
                        <div className={styles.sectionHeader}>
                            <PageHeader title="User Directory" description="Manage user roles and bans." />
                        </div>

                        <div className={styles.grid}>
                            {users.map(u => (
                                <div key={u.id} className={`${styles.card} ${u.banned ? styles.banned : ''}`}>
                                    <div className={styles.cardContent}>
                                        <span className={styles.cardTitle}>
                                            {u.username}
                                            {u.banned && <span className={styles.banTag}>BANNED</span>}
                                        </span>
                                        <span className={styles.cardSub}>{u.email} • Joined {new Date(u.joined_at || Date.now()).toLocaleDateString()}</span>
                                    </div>
                                    <div className={styles.cardActions}>
                                        <CustomSelect
                                            value={u.role}
                                            onChange={(val) => handleRoleChange(u.id, val as any)}
                                            options={[
                                                { value: 'user', label: 'User' },
                                                { value: 'admin', label: 'Admin' },
                                                { value: 'developer', label: 'Dev' },
                                            ]}
                                            width={140}
                                        />
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
                )}

                {activeSection === 'news' && (
                    <>
                        <div className={styles.sectionHeader}>
                            <PageHeader title="News & Updates" description="Publish news articles and changelogs." />
                            <div style={{ display: 'flex', gap: 12 }}>
                                <button className={styles.actionBtn} onClick={() => { setShowNewsForm(!showNewsForm); setShowChangelogForm(false); }}>
                                    <Plus size={18} /> New Post
                                </button>
                                <button className={styles.actionBtn} style={{ background: '#222', border: '1px solid #444', color: 'white' }} onClick={() => { setShowChangelogForm(!showChangelogForm); setShowNewsForm(false); }}>
                                    <GitBranch size={18} /> Changelog
                                </button>
                            </div>
                        </div>

                        {showNewsForm && (
                            <div className={styles.formCard}>
                                <h3>Create Post</h3>
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
                                        <input
                                            className={styles.input}
                                            placeholder="Version (e.g. v1.0.5)"
                                            value={newNews.version}
                                            onChange={e => setNewNews({ ...newNews, version: e.target.value })}
                                        />
                                    )}
                                    <input className={styles.input} placeholder="Image URL (optional)" value={newNews.image_url} onChange={e => setNewNews({ ...newNews, image_url: e.target.value })} />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <span>Accent:</span>
                                        <input type="color" className={styles.colorPicker} value={newNews.color} onChange={e => setNewNews({ ...newNews, color: e.target.value })} />
                                    </div>
                                </div>
                                <button className={styles.actionBtn} style={{ marginTop: 16 }} onClick={handleCreateNews}><Save size={16} /> Publish Post</button>
                            </div>
                        )}

                        {showChangelogForm && (
                            <div className={styles.formCard}>
                                <h3>Create Changelog</h3>
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
                                <button className={styles.actionBtn} style={{ marginTop: 16 }} onClick={handleCreateChangelog}><Save size={16} /> Save Changelog</button>
                            </div>
                        )}

                        <div className={styles.grid}>
                            {/* News List */}
                            <div style={{ gridColumn: '1 / -1' }}>
                                <h4 style={{ margin: '10px 0', opacity: 0.5, fontSize: '12px', textTransform: 'uppercase' }}>News Articles</h4>
                            </div>
                            {news.map(item => (
                                <div key={item.id} className={styles.card} style={{ borderLeft: `4px solid ${item.color || '#ff8800'}` }}>
                                    <div className={styles.cardContent}>
                                        <span className={styles.cardTitle}>{item.title}</span>
                                        <span className={styles.cardSub}>{item.category} • {new Date(item.created_at).toLocaleDateString()}</span>
                                    </div>
                                    <div className={styles.cardActions}>
                                        <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => handleDeleteNews(item.id)}>
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))}

                            {/* Changelog List */}
                            <div style={{ gridColumn: '1 / -1', marginTop: 20 }}>
                                <h4 style={{ margin: '10px 0', opacity: 0.5, fontSize: '12px', textTransform: 'uppercase' }}>Recent Changelogs</h4>
                            </div>
                            {changelogs.map(log => (
                                <div key={log.id} className={styles.card}>
                                    <div className={styles.cardContent}>
                                        <span className={styles.cardTitle}>v{log.version} <span className={styles.typeTag}>{log.type}</span></span>
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
                )}

                {activeSection === 'system' && (
                    <div className={styles.systemSection}>
                        <div className={styles.sectionHeader}>
                            <PageHeader title="System Configuration" description="Manage global settings." />
                        </div>

                        <div className={styles.card} style={{ maxWidth: '500px' }}>
                            <div className={styles.cardContent}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                                    <Settings size={24} color="#ff8800" />
                                    <span className={styles.cardTitle}>Application Version</span>
                                </div>
                                <p style={{ color: '#888', fontSize: '14px', marginBottom: 20 }}>
                                    Updating the version here will reflect across the TitleBar, Splash screen, and other areas for all users.
                                </p>

                                <div className={styles.versionManager}>
                                    <div className={styles.versionDisplay}>
                                        <span style={{ fontSize: '12px', color: '#666', textTransform: 'uppercase' }}>Current</span>
                                        <span style={{ fontSize: '24px', fontWeight: 800, color: '#fff' }}>v{currentVersion}</span>
                                    </div>
                                    <div className={styles.versionInputGroup}>
                                        <input
                                            className={styles.input}
                                            placeholder="New Version (e.g. 1.0.1)"
                                            value={newVersion}
                                            onChange={e => setNewVersion(e.target.value)}
                                        />
                                        <button className={styles.actionBtn} onClick={handleUpdateVersion}>
                                            <Save size={18} /> Update
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeSection === 'announcements' && (
                    <div className={styles.systemSection}>
                        <div className={styles.sectionHeader}>
                            <PageHeader title="Update Announcements" description="Notify users about new versions." />
                        </div>

                        <div className={styles.formCard}>
                            <h3>Create Update Announcement</h3>
                            <div className={styles.formGrid}>
                                <input
                                    className={styles.input}
                                    placeholder="Version (e.g. 2.4.0)"
                                    value={newUpdate.version}
                                    onChange={e => setNewUpdate({ ...newUpdate, version: e.target.value })}
                                />
                                <input
                                    className={styles.input}
                                    placeholder="Download URL"
                                    value={newUpdate.downloadUrl}
                                    onChange={e => setNewUpdate({ ...newUpdate, downloadUrl: e.target.value })}
                                />
                            </div>
                            <div className={styles.formGrid}>
                                <input
                                    className={styles.input}
                                    placeholder="Button Title (e.g. Download v2.4.0)"
                                    value={newUpdate.buttonTitle}
                                    onChange={e => setNewUpdate({ ...newUpdate, buttonTitle: e.target.value })}
                                />
                                <select
                                    className={styles.input}
                                    value={newUpdate.priority}
                                    onChange={e => setNewUpdate({ ...newUpdate, priority: e.target.value as any })}
                                >
                                    <option value="low">Low</option>
                                    <option value="normal">Normal</option>
                                    <option value="high">High</option>
                                    <option value="critical">Critical</option>
                                </select>
                            </div>
                            <textarea
                                className={styles.textarea}
                                rows={2}
                                placeholder="Optional message..."
                                value={newUpdate.message}
                                onChange={e => setNewUpdate({ ...newUpdate, message: e.target.value })}
                            />
                            <button className={styles.actionBtn} style={{ marginTop: 12 }} onClick={handleCreateUpdate}>
                                <Download size={16} /> Create Update
                            </button>
                        </div>

                        <div className={styles.grid}>
                            {announcements.length === 0 && <div className={styles.emptyState}>No updates announced yet.</div>}
                            {announcements.map(update => (
                                <div key={update.id} className={styles.card}>
                                    <div className={styles.cardContent}>
                                        <span className={styles.cardTitle}>
                                            v{update.version}
                                            <span className={styles.badge}>{update.priority}</span>
                                        </span>
                                        <span className={styles.cardSub}>Created: {new Date(update.created_at).toLocaleDateString()}</span>
                                        {update.message && <p style={{ color: '#aaa', fontSize: '13px', marginTop: 6 }}>{update.message}</p>}
                                        <span style={{ fontSize: '11px', color: '#666' }}>{update.download_url}</span>
                                    </div>
                                    <div className={styles.cardActions}>
                                        <button className={`${styles.iconBtn} ${styles.danger}`} onClick={() => handleDeleteUpdate(update.id)}>
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

