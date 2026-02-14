import React, { useState, useEffect } from 'react';
import styles from './ModsManager.module.css'; // Re-use styles
import { Instance, InstanceApi } from '../api/instances';
import { Search, Cuboid, ChevronRight, Package, Box } from 'lucide-react';
import { PageHeader } from '../components/PageHeader';
import { InstanceResourcePacks } from './';
import { Skeleton } from '../components/Skeleton';

interface ResourcePacksManagerProps {
    user?: any;
    hideHeader?: boolean;
    instanceId?: string | null;
}

export const ResourcePacksManager: React.FC<ResourcePacksManagerProps> = ({ hideHeader, instanceId }) => {
    const [instances, setInstances] = useState<Instance[]>([]);
    const [localSelectedId, setLocalSelectedId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const effectiveSelectedId = instanceId || localSelectedId;

    useEffect(() => {
        if (!instanceId) {
            loadInstances();
        }
    }, [instanceId]);

    const loadInstances = async () => {
        setLoading(true);
        try {
            const list = await InstanceApi.list();
            setInstances(list);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (effectiveSelectedId) {
        return (
            <InstanceResourcePacks
                instanceId={effectiveSelectedId}
                hideBackButton={!!instanceId}
                hideHeader={hideHeader}
                onBack={() => {
                    if (!instanceId) {
                        setLocalSelectedId(null);
                        loadInstances();
                    }
                }}
            />
        );
    }

    const filtered = instances.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));

    const getLoaderClass = (loader: string) => {
        return styles[`loader${(loader || 'Vanilla').charAt(0).toUpperCase() + (loader || 'Vanilla').slice(1).toLowerCase()}`] || styles.loaderVanilla;
    };

    return (
        <div className={styles.container}>
            <div className={styles.topSection}>
                {!hideHeader && (
                    <PageHeader
                        title="Resource Packs"
                        description="Manage texture packs for your instances."
                    />
                )}

                <div className={styles.searchWrapper}>
                    <Search size={18} className={styles.searchIcon} />
                    <input
                        className={styles.searchInput}
                        placeholder="Search instances..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>
            </div>

            <div className={styles.grid}>
                {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className={styles.cardSkeleton}>
                            <Skeleton width="100%" height={140} style={{ borderRadius: 20 }} />
                        </div>
                    ))
                ) : filtered.length === 0 ? (
                    <div className={styles.emptyState}>
                        <div className={styles.emptyIcon}>
                            <Box size={48} strokeWidth={1} />
                        </div>
                        <h3>No Instances Found</h3>
                        <p>Create an instance to add resource packs.</p>
                    </div>
                ) : (
                    filtered.map(inst => (
                        <div key={inst.id} className={styles.card} onClick={() => setLocalSelectedId(inst.id)}>
                            <div className={styles.cardBg} />

                            <div className={styles.cardContent}>
                                <div className={styles.cardHeader}>
                                    <div className={`${styles.loaderBadge} ${getLoaderClass(inst.loader)}`}>
                                        <Cuboid size={12} strokeWidth={2.5} />
                                        {inst.loader || 'Vanilla'}
                                    </div>
                                    <span className={styles.version}>{inst.version}</span>
                                </div>

                                <div className={styles.instanceInfo}>
                                    <h3 className={styles.instanceName}>{inst.name}</h3>
                                    <div className={styles.actionRow}>
                                        <span className={styles.manageLabel}>
                                            <Package size={14} /> Manage Packs
                                        </span>
                                        <div className={styles.arrowBtn}>
                                            <ChevronRight size={16} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div >
    );
};
