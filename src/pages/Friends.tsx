import { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';
import styles from './Friends.module.css';
import { Globe, Package, Users, UserPlus, Search, Check, X, Clock, Info, Calendar, User, WifiOff, Lock } from 'lucide-react';
import { CloudManager } from '../utils/CloudManager';
import { AccountManager } from '../utils/AccountManager';
import { InstanceApi } from '../api/instances';
import { Skeleton } from '../components/Skeleton';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';

interface FriendsProps {
    isOnline?: boolean;
}

export const Friends: React.FC<FriendsProps> = ({ isOnline = true }) => {
    const [activeTab, setActiveTab] = useState<'list' | 'requests' | 'add' | 'shared'>('list');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [friends, setFriends] = useState<any[]>([]);
    const [requests, setRequests] = useState<any[]>([]);
    const [sharedInstances, setSharedInstances] = useState<any[]>([]);
    const [selectedShare, setSelectedShare] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();
    const confirm = useConfirm();

    const user = AccountManager.getActive();

    useEffect(() => {
        if (user?.type === 'yashin') {
            loadFriends();
            loadRequests();
            if (activeTab === 'shared') loadSharedInstances();
        }
    }, [activeTab, user?.uuid]);

    const loadSharedInstances = async () => {
        if (!user) return;
        setLoading(true);
        const data = await CloudManager.getSharedInstances(user.uuid);
        setSharedInstances(data);
        setLoading(false);
    };

    const acceptSharedInstance = async (share: any) => {
        const yes = await confirm(
            "Add Shared Instance",
            `Do you want to add "${share.instance_data.name}" to your profiles?`,
            { confirmLabel: "Add Instance" }
        );

        if (!yes) return;

        // Optimistic UI: remove from list immediately
        setSharedInstances(prev => prev.filter(s => s.id !== share.id));

        try {
            // 1. Create local instance files
            const res = await InstanceApi.create(
                share.instance_data.name,
                share.instance_data.version,
                share.instance_data.loader
            );

            if (res.success) {
                // 2. Mark as accepted in DB
                const success = await CloudManager.acceptSharedInstance(share.id);
                if (success) {
                    showToast('Instance added to your profiles!', 'success');
                } else {
                    showToast('Created locally, but cloud update failed.', 'info');
                }
            } else {
                showToast(`Failed to create instance: ${res.error}`, 'error');
                // Rollback if failed? Actually, it's better to just reload
                loadSharedInstances();
            }
        } catch (e) {
            console.error("[Friends] Share acceptance failed", e);
            showToast('Failed to add instance.', 'error');
            loadSharedInstances();
        }
    };

    const loadFriends = async () => {
        if (!user) return;
        setLoading(true);
        const data = await CloudManager.getFriends(user.uuid);
        setFriends(data);
        setLoading(false);
    };

    const loadRequests = async () => {
        if (!user) return;
        const data = await CloudManager.getFriendRequests(user.uuid);
        setRequests(data);
    };

    const handleSearch = async () => {
        if (!searchQuery.trim() || !user) return;
        setLoading(true);
        try {
            const results = await CloudManager.searchUsers(searchQuery);
            const filtered = results.filter(r => r.id !== user.uuid && !friends.some(f => f.id === r.id));
            setSearchResults(filtered);
        } catch (e) {
            console.error("[Friends] Search failed", e);
            showToast('Search failed.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const sendRequest = async (targetId: string) => {
        if (!user) return;
        const success = await CloudManager.sendFriendRequest(user.uuid, targetId);
        if (success) {
            showToast('Friend request sent!', 'success');
            setSearchResults(prev => prev.filter(p => p.id !== targetId));
        } else {
            showToast('Failed to send request.', 'error');
        }
    };

    const acceptRequest = async (requestId: string) => {
        const success = await CloudManager.acceptFriendRequest(requestId);
        if (success) {
            showToast('Request accepted!', 'success');
            loadRequests();
            loadFriends();
        } else {
            showToast('Failed to accept request.', 'error');
        }
    };

    const handleRemoveFriend = async (friendId: string, friendName: string) => {
        const yes = await confirm(
            "Remove Friend",
            `Are you sure you want to remove ${friendName}?`,
            { confirmLabel: "Remove", isDanger: true }
        );

        if (!yes || !user) return;

        const success = await CloudManager.removeFriend(user.uuid, friendId);
        if (success) {
            showToast(`${friendName} removed.`, 'success');
            loadFriends();
        } else {
            showToast('Failed to remove friend.', 'error');
        }
    };

    if (user?.type !== 'yashin') {
        return (
            <div className={styles.container}>
                <div className={styles.header}>
                    <h1><Users size={32} /> Friends</h1>
                </div>
                <div style={{ padding: 40, textAlign: 'center', color: '#a1a1aa' }}>
                    <h2>Yashin Account Required</h2>
                    <p>Please login with a Yashin account to use social features.</p>
                </div>
            </div>
        );
    }

    // Offline Mode Lock
    if (!isOnline) {
        return (
            <div className={styles.container}>
                <PageHeader
                    title="Friends"
                    description="Connect and play with your friends, and share your instances."
                />
                <div className={styles.offlineLock}>
                    <div className={styles.lockIcon}>
                        <WifiOff size={48} />
                    </div>
                    <h2>Internet Connection Required</h2>
                    <p>Friends feature requires an active internet connection. Please check your network and try again.</p>
                    <div className={styles.lockBadge}>
                        <Lock size={14} />
                        <span>Feature Locked</span>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <PageHeader
                title="Friends"
                description="Connect and play with your friends, and share your instances."
            />
            <div className={styles.header}>
                <div className={styles.tabs}>
                    <button
                        className={`${styles.tab} ${activeTab === 'list' ? styles.active : ''}`}
                        onClick={() => setActiveTab('list')}
                    >
                        <Users size={16} /> My Friends
                        {friends.length > 0 && <span style={{ opacity: 0.5, fontSize: 12 }}>{friends.length}</span>}
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'shared' ? styles.active : ''}`}
                        onClick={() => setActiveTab('shared')}
                    >
                        <Globe size={16} /> Shared with Me
                        {sharedInstances.length > 0 && (
                            <span style={{
                                background: '#ff8800',
                                color: 'white',
                                padding: '1px 6px',
                                borderRadius: 8,
                                fontSize: 10,
                                fontWeight: 700
                            }}>
                                {sharedInstances.length}
                            </span>
                        )}
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'requests' ? styles.active : ''}`}
                        onClick={() => setActiveTab('requests')}
                    >
                        <Clock size={16} /> Requests
                        {requests.length > 0 && (
                            <span style={{
                                background: '#ef4444',
                                color: 'white',
                                padding: '1px 6px',
                                borderRadius: 8,
                                fontSize: 10,
                                fontWeight: 700
                            }}>
                                {requests.length}
                            </span>
                        )}
                    </button>
                    <button
                        className={`${styles.tab} ${activeTab === 'add' ? styles.active : ''}`}
                        onClick={() => setActiveTab('add')}
                    >
                        <UserPlus size={16} /> Add Friend
                    </button>
                </div>
            </div>

            <div className={styles.content}>
                {activeTab === 'add' && (
                    <div style={{ maxWidth: 600, margin: '0 auto', width: '100%' }}>
                        <div className={styles.searchBar}>
                            <input
                                type="text"
                                className={styles.searchInput}
                                placeholder="Search by username..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                            />
                            <button className={styles.searchBtn} onClick={handleSearch}>
                                <Search size={20} />
                            </button>
                        </div>

                        <div className={styles.list}>
                            {loading ? (
                                Array(3).fill(0).map((_, i) => (
                                    <div key={i} className={styles.userCard}>
                                        <Skeleton width={48} height={48} style={{ borderRadius: 12 }} />
                                        <div className={styles.userInfo}>
                                            <Skeleton width={120} height={14} style={{ marginBottom: 4 }} />
                                            <Skeleton width={80} height={14} />
                                        </div>
                                    </div>
                                ))
                            ) : searchResults.length === 0 ? (
                                <div style={{ opacity: 0.5, textAlign: 'center', gridColumn: '1/-1' }}>No users found.</div>
                            ) : (
                                searchResults.map(result => (
                                    <div key={result.id} className={styles.userCard}>
                                        <div className={styles.avatar}>
                                            <img src={result.avatar_url || `https://mc-heads.net/avatar/${result.username}`} alt={result.username} />
                                        </div>
                                        <div className={styles.userInfo}>
                                            <div className={styles.userName}>{result.username || 'Unknown'}</div>
                                        </div>
                                        <button className={styles.actionBtn} onClick={() => sendRequest(result.id)}>
                                            <UserPlus size={18} />
                                        </button>
                                    </div>
                                )))}
                        </div>
                    </div>
                )}

                {activeTab === 'shared' && (
                    <div className={styles.list}>
                        {loading ? (
                            Array(3).fill(0).map((_, i) => (
                                <div key={i} className={styles.userCard}>
                                    <Skeleton width={48} height={48} style={{ borderRadius: 12 }} />
                                    <div className={styles.userInfo}>
                                        <Skeleton width={120} height={14} style={{ marginBottom: 4 }} />
                                        <Skeleton width={80} height={14} />
                                    </div>
                                </div>
                            ))
                        ) : sharedInstances.length === 0 ? (
                            <div style={{ opacity: 0.5, textAlign: 'center', gridColumn: '1/-1' }}>No shared instances yet.</div>
                        ) : (
                            sharedInstances.map(share => (
                                <div key={share.id} className={styles.shareCard}>
                                    <div className={styles.shareIcon}>
                                        <Package size={24} color="#ff8800" />
                                    </div>
                                    <div className={styles.shareInfo}>
                                        <div className={styles.shareName}>{share.instance_data.name}</div>
                                        <div className={styles.shareMeta}>
                                            <span>{share.instance_data.version}</span>
                                            <span className={styles.dot}>•</span>
                                            <span>{share.instance_data.loader}</span>
                                        </div>
                                        <div className={styles.shareFrom}>Shared by <strong>{share.sender?.username || 'Friend'}</strong></div>
                                    </div>
                                    <div className={styles.shareActions}>
                                        <button className={styles.infoBtn} onClick={() => setSelectedShare(share)} title="View Details">
                                            <Info size={18} />
                                        </button>
                                        <button className={styles.addBtn} onClick={() => acceptSharedInstance(share)}>
                                            <Check size={18} /> Add
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
                {activeTab === 'list' && (
                    <div className={styles.list}>
                        {loading ? (
                            Array(3).fill(0).map((_, i) => (
                                <div key={i} className={styles.userCard}>
                                    <Skeleton width={48} height={48} style={{ borderRadius: 12 }} />
                                    <div className={styles.userInfo}>
                                        <Skeleton width={120} height={14} style={{ marginBottom: 4 }} />
                                        <Skeleton width={80} height={14} />
                                    </div>
                                </div>
                            ))
                        ) : friends.length === 0 ? (
                            <div style={{ opacity: 0.5, textAlign: 'center', gridColumn: '1/-1' }}>No friends yet.</div>
                        ) : (
                            friends.map(friend => (
                                <div key={friend.id} className={styles.userCard}>
                                    <div className={styles.avatar}>
                                        <img src={friend.avatar_url || `https://mc-heads.net/avatar/${friend.username}`} alt={friend.username} />
                                    </div>
                                    <div className={styles.userInfo}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <div className={styles.userName}>{friend?.username || friend?.name || 'Unknown Friend'}</div>
                                        </div>
                                        <div className={styles.userMeta}>Online</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className={styles.actionBtn} onClick={() => handleRemoveFriend(friend.id, friend.username || friend.name || 'Friend')}>
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {activeTab === 'requests' && (
                    <div className={styles.list}>
                        {loading ? (
                            Array(3).fill(0).map((_, i) => (
                                <div key={i} className={styles.userCard}>
                                    <Skeleton width={48} height={48} style={{ borderRadius: 12 }} />
                                    <div className={styles.userInfo}>
                                        <Skeleton width={120} height={14} style={{ marginBottom: 4 }} />
                                        <Skeleton width={80} height={14} />
                                    </div>
                                </div>
                            ))
                        ) : requests.length === 0 ? (
                            <div style={{ opacity: 0.5, textAlign: 'center', gridColumn: '1/-1' }}>No pending requests.</div>
                        ) : (
                            requests.map(req => (
                                <div key={req.id} className={styles.userCard}>
                                    <div className={styles.avatar}>
                                        <img src={req.sender?.avatar_url || `https://mc-heads.net/avatar/${req.sender?.username}`} alt={req.sender?.username} />
                                    </div>
                                    <div className={styles.userInfo}>
                                        <div className={styles.userName}>{req.sender?.username || 'Unknown'}</div>
                                        <div className={styles.userMeta}>Sent you a friend request</div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <button className={`${styles.actionBtn} ${styles.acceptBtn}`} onClick={() => acceptRequest(req.id)}>
                                            <Check size={18} />
                                        </button>
                                        <button className={styles.actionBtn} onClick={() => {/* Reject */ }}>
                                            <X size={18} />
                                        </button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {selectedShare && (
                <div className={styles.modalOverlay} onClick={() => setSelectedShare(null)}>
                    <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <div className={styles.modalIcon}>
                                <Package size={32} color="#ff8800" />
                            </div>
                            <div className={styles.modalTitleArea}>
                                <h2>{selectedShare.instance_data.name}</h2>
                                <p>Instance Configuration</p>
                            </div>
                            <button className={styles.modalClose} onClick={() => setSelectedShare(null)}>
                                <X size={20} />
                            </button>
                        </div>
                        <div className={styles.modalBody}>
                            <div className={styles.infoGrid}>
                                <div className={styles.infoItem}>
                                    <label><Globe size={14} /> Version</label>
                                    <span>{selectedShare.instance_data.version}</span>
                                </div>
                                <div className={styles.infoItem}>
                                    <label><Package size={14} /> Loader</label>
                                    <span>{selectedShare.instance_data.loader}</span>
                                </div>
                                <div className={styles.infoItem}>
                                    <label><User size={14} /> Shared By</label>
                                    <span>{selectedShare.sender?.username || 'Unknown'}</span>
                                </div>
                                <div className={styles.infoItem}>
                                    <label><Calendar size={14} /> Received On</label>
                                    <span>{new Date(selectedShare.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>
                        </div>
                        <div className={styles.modalFooter}>
                            <button className={styles.modalCancel} onClick={() => setSelectedShare(null)}>Close</button>
                            <button className={styles.modalAdd} onClick={() => {
                                acceptSharedInstance(selectedShare);
                                setSelectedShare(null);
                            }}>
                                <Check size={18} /> Add to Profiles
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
