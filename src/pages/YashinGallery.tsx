import React, { useState, useEffect, useCallback } from 'react';
import styles from './YashinGallery.module.css';
import { CloudManager } from '../utils/CloudManager';
import { SkinCard } from '../components/SkinCard';
import { PublicProfile } from '../types/profile';
import { Search, ChevronLeft, ChevronRight, RefreshCw, Users } from 'lucide-react';

interface YashinGalleryProps {
    onViewProfile: (username: string) => void;
    user?: {
        type?: string;
    };
}

export const YashinGallery: React.FC<YashinGalleryProps> = ({ onViewProfile, user }) => {
    const isYashinUser = user?.type === 'yashin';
    const [profiles, setProfiles] = useState<PublicProfile[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const loadProfiles = useCallback(async (pageNum: number, searchQuery: string) => {
        setLoading(true);
        try {
            let data: PublicProfile[];
            if (searchQuery.trim()) {
                data = await CloudManager.searchPublicProfiles(searchQuery.trim());
                setHasMore(false);
            } else {
                data = await CloudManager.getPublicProfiles(pageNum);
                setHasMore(data.length === 24);
            }
            // Always replace the list (page-replace mode)
            setProfiles(data);
        } catch (error) {
            console.error('[YashinGallery] Failed to load profiles:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadProfiles(1, search);
    }, [search, loadProfiles]);

    const handleSearch = () => {
        setSearch(searchInput);
        setPage(1);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        setSearchInput('');
        setSearch('');
        setPage(1);
        await loadProfiles(1, '');
        setRefreshing(false);
    };

    const handleNextPage = () => {
        if (!loading && hasMore) {
            const nextPage = page + 1;
            setPage(nextPage);
            loadProfiles(nextPage, search);
        }
    };

    const handlePrevPage = () => {
        if (!loading && page > 1) {
            const prevPage = page - 1;
            setPage(prevPage);
            loadProfiles(prevPage, search);
        }
    };

    return (
        <div className={styles.container}>
            {!isYashinUser && (
                <div className={styles.noticeBanner}>
                    <span className={styles.noticeText}>
                        Sign in with a Yashin account to upload your own skins to the gallery
                    </span>
                </div>
            )}
            <div className={styles.header}>
                <div className={styles.titleSection}>
                    <h1 className={styles.title}>
                        <Users size={28} />
                        Skin Gallery
                    </h1>
                    <p className={styles.subtitle}>
                        Browse Yashin users and their skins
                    </p>
                </div>

                <div className={styles.searchSection}>
                    <div className={styles.searchBox}>
                        <Search size={18} className={styles.searchIcon} />
                        <input
                            type="text"
                            placeholder="Search usernames..."
                            value={searchInput}
                            onChange={e => setSearchInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className={styles.searchInput}
                        />
                    </div>
                    <button className={styles.searchBtn} onClick={handleSearch}>
                        Search
                    </button>
                    <button
                        className={`${styles.refreshBtn} ${refreshing ? styles.spinning : ''}`}
                        onClick={handleRefresh}
                        disabled={refreshing}
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            {loading && profiles.length === 0 ? (
                <div className={styles.loading}>
                    <div className={styles.spinner} />
                    <span>Loading profiles...</span>
                </div>
            ) : profiles.length === 0 ? (
                <div className={styles.empty}>
                    {search ? (
                        <>
                            <span>No users found matching "{search}"</span>
                            <button className={styles.clearBtn} onClick={() => { setSearch(''); setSearchInput(''); }}>
                                Clear Search
                            </button>
                        </>
                    ) : (
                        <span>No public profiles yet</span>
                    )}
                </div>
            ) : (
                <>
                    <div className={styles.grid}>
                        {profiles.map(profile => (
                            <SkinCard
                                key={profile.id}
                                profile={profile}
                                onClick={() => onViewProfile(profile.username)}
                            />
                        ))}
                    </div>

                    {!search && (
                        <div className={styles.pagination}>
                            <button
                                className={styles.pageBtn}
                                onClick={handlePrevPage}
                                disabled={page === 1 || loading}
                            >
                                <ChevronLeft size={18} />
                                Previous
                            </button>
                            <span className={styles.pageInfo}>Page {page}</span>
                            <button
                                className={styles.pageBtn}
                                onClick={handleNextPage}
                                disabled={!hasMore || loading}
                            >
                                Next
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
