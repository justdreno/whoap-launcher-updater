import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/PageHeader';
import styles from './News.module.css';
import { ContentManager, NewsItem, ChangelogItem } from '../utils/ContentManager';
import { Newspaper, GitBranch, WifiOff, Gamepad2, ExternalLink, RefreshCw } from 'lucide-react';
import { Skeleton } from '../components/Skeleton';
import { NewsCard } from '../components/NewsCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useOfflineStatus } from '../hooks/useOfflineStatus';

export const News: React.FC = () => {
    const [news, setNews] = useState<NewsItem[]>([]);
    const [minecraftNews, setMinecraftNews] = useState<NewsItem[]>([]);
    const [changelogs, setChangelogs] = useState<ChangelogItem[]>([]);
    const [activeTab, setActiveTab] = useState<'minecraft' | 'news' | 'updates'>('minecraft');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [cacheStatus, setCacheStatus] = useState<{
        news: { fromCache: boolean; age?: string };
        changelogs: { fromCache: boolean; age?: string };
        minecraft: { fromCache: boolean; age?: string };
    }>({
        news: { fromCache: false },
        changelogs: { fromCache: false },
        minecraft: { fromCache: false }
    });
    
    const isOffline = useOfflineStatus();

    const loadContent = async (forceRefresh: boolean = false) => {
        if (forceRefresh) setRefreshing(true);
        else setLoading(true);
        
        try {
            const [newsResult, changelogResult, minecraftNewsResult] = await Promise.all([
                ContentManager.fetchNews(forceRefresh),
                ContentManager.fetchChangelogs(forceRefresh),
                ContentManager.fetchMinecraftNews(forceRefresh)
            ]);
            setNews(newsResult.items);
            setChangelogs(changelogResult.items);
            setMinecraftNews(minecraftNewsResult.items);
            setCacheStatus({
                news: { fromCache: newsResult.fromCache, age: newsResult.cacheAge },
                changelogs: { fromCache: changelogResult.fromCache, age: changelogResult.cacheAge },
                minecraft: { fromCache: minecraftNewsResult.fromCache, age: minecraftNewsResult.cacheAge }
            });
        } catch (e) {
            console.error("Failed to load content", e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadContent();
    }, []);

    const handleRefresh = () => {
        if (!isOffline) {
            loadContent(true);
        }
    };

    const getCurrentCacheInfo = () => {
        switch (activeTab) {
            case 'minecraft': return cacheStatus.minecraft;
            case 'news': return cacheStatus.news;
            case 'updates': return cacheStatus.changelogs;
        }
    };

    const formatDate = (dateStr: string) => {
        try {
            if (!dateStr) return 'Unknown';
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return 'Invalid';
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        } catch {
            return 'Error';
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.content}>
                <PageHeader
                    title="News & Updates"
                    description="Stay up to date with official Minecraft news and launcher updates."
                />

                {/* Cache Status Banner */}
                {getCurrentCacheInfo().fromCache && (
                    <div className={styles.cacheBanner}>
                        <WifiOff size={14} />
                        <div className={styles.cacheInfo}>
                            <span>Cached content</span>
                            {getCurrentCacheInfo().age && (
                                <span className={styles.cacheAge}>Last updated: {getCurrentCacheInfo().age}</span>
                            )}
                        </div>
                    </div>
                )}

                {/* Tab Switcher & Refresh */}
                <div className={styles.headerControls}>
                    <div className={styles.tabs}>
                        <button
                            className={`${styles.tab} ${activeTab === 'minecraft' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('minecraft')}
                        >
                            <Gamepad2 size={16} />
                            Minecraft
                        </button>
                        <button
                            className={`${styles.tab} ${activeTab === 'news' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('news')}
                        >
                            <Newspaper size={16} />
                            Launcher
                        </button>
                        <button
                            className={`${styles.tab} ${activeTab === 'updates' ? styles.activeTab : ''}`}
                            onClick={() => setActiveTab('updates')}
                        >
                            <GitBranch size={16} />
                            Changelog
                        </button>
                    </div>
                    
                    <button
                        className={styles.refreshBtn}
                        onClick={handleRefresh}
                        disabled={isOffline || refreshing}
                        title={isOffline ? 'Connect to internet to refresh' : 'Refresh content'}
                    >
                        <RefreshCw size={16} className={refreshing ? styles.spinning : ''} />
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>

                {loading ? (
                    activeTab === 'news' || activeTab === 'minecraft' ? (
                        <div className={styles.newsGrid}>
                            {Array(4).fill(0).map((_, i) => (
                                <div key={i} style={{ height: 300, background: 'rgba(255,255,255,0.05)', borderRadius: 16 }} />
                            ))}
                        </div>
                    ) : (
                        <div className={styles.timeline}>
                            {Array(3).fill(0).map((_, i) => (
                                <div key={i} className={styles.timelineItem} style={{ height: 100 }}>
                                    <Skeleton width={200} height={24} />
                                    <Skeleton width="100%" height={60} style={{ marginTop: 12 }} />
                                </div>
                            ))}
                        </div>
                    )
                ) : activeTab === 'minecraft' ? (
                    <>
                        <div className={styles.minecraftBanner}>
                            <div className={styles.bannerContent}>
                                <Gamepad2 size={32} />
                                <div>
                                    <h3>Official Minecraft News</h3>
                                    <p>Latest updates directly from Mojang Studios</p>
                                </div>
                            </div>
                            <button 
                                onClick={() => window.ipcRenderer.invoke('app:open-external', 'https://www.minecraft.net/en-us/articles')}
                                className={styles.bannerLink}
                            >
                                <ExternalLink size={16} />
                                Visit Minecraft.net
                            </button>
                        </div>
                        <div className={styles.newsGrid}>
                            {minecraftNews.length === 0 ? (
                                <div className={styles.empty}>No Minecraft news available</div>
                            ) : (
                                minecraftNews.map((item) => (
                                    <NewsCard
                                        key={item.id}
                                        title={item.title}
                                        content={item.content}
                                        date={item.date}
                                        imageUrl={item.image_url}
                                        color={item.color}
                                        linkUrl={item.link_url}
                                        category="Minecraft"
                                    />
                                ))
                            )}
                        </div>
                    </>
                ) : activeTab === 'news' ? (
                    <div className={styles.newsGrid}>
                        {news.length === 0 ? (
                            <div className={styles.empty}>No news available</div>
                        ) : (
                            news.map((item) => (
                                <NewsCard
                                    key={item.id}
                                    title={item.title}
                                    content={item.content}
                                    date={item.date}
                                    imageUrl={item.image_url}
                                    color={item.color}
                                    linkUrl={item.link_url}
                                    category="News"
                                />
                            ))
                        )}
                    </div>
                ) : (
                    <div className={styles.timeline}>
                        {changelogs.length === 0 ? (
                            <div className={styles.empty}>No updates available</div>
                        ) : (
                            changelogs.map((log) => (
                                <div key={log.id} className={styles.timelineItem}>
                                    <div className={styles.timelineDot} />
                                    <span className={styles.timelineDate}>{formatDate(log.date)}</span>

                                    <div className={styles.timelineContent}>
                                        <div className={styles.timelineHeader}>
                                            <div className={styles.versionBadge}>
                                                <GitBranch size={12} />
                                                {log.version}
                                            </div>
                                            <span className={`${styles.typeBadge} ${styles[log.type]}`}>{log.type}</span>
                                        </div>

                                        <div style={{ color: '#a1a1aa', fontSize: '0.9rem', lineHeight: '1.6' }}>
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {log.description}
                                            </ReactMarkdown>
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
