import React, { useState, useEffect } from 'react';
import styles from './ModVersionSelector.module.css';
import { X, Download, AlertTriangle, Loader2 } from 'lucide-react';

interface Props {
    mod: any;
    instanceMeta: { version: string, loader: string };
    onClose: () => void;
    onInstall: (version: any, file: any) => void;
}

export const ModVersionSelector: React.FC<Props> = ({ mod, instanceMeta, onClose, onInstall }) => {
    const [versions, setVersions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterAll, setFilterAll] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    useEffect(() => {
        loadVersions();
    }, []);

    const loadVersions = async () => {
        setLoading(true);
        try {
            const result = await window.ipcRenderer.invoke('modpack:get-versions', mod.id, 'modrinth');
            if (result.success) {
                setVersions(result.versions);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const getCompatible = () => {
        const loader = instanceMeta.loader.toLowerCase();
        const supportsStandardLoader = loader === 'fabric' || loader === 'forge';

        return versions.map((v: any) => {
            const supportsLoader = v.loaders.includes(loader) ||
                (loader === 'quilt' && v.loaders.includes('fabric')) ||
                (loader === 'neoforge' && v.loaders.includes('forge'));

            const supportsVersion = v.game_versions.includes(instanceMeta.version) ||
                v.game_versions.some((gv: string) => instanceMeta.version.startsWith(gv));

            const matchesSearch = !searchQuery ||
                v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                v.version_number.includes(searchQuery);

            // Special: Detection validation
            const hasLetters = /[a-zA-Z]/.test(v.version_number);
            const needsWarning = hasLetters || !supportsStandardLoader;

            return {
                ...v,
                isCompatible: supportsLoader && supportsVersion,
                matchesSearch,
                needsWarning
            };
        }).filter(v => v.matchesSearch && (filterAll || v.isCompatible));
    };

    const compatibleVersions = getCompatible();

    return (
        <div className={styles.overlay}>
            <div className={styles.modal}>
                <div className={styles.header}>
                    <div>
                        <h3>Select Version</h3>
                        <div className={styles.sub}>For {mod.title}</div>
                    </div>
                    <button onClick={onClose} className={styles.closeBtn}><X size={20} /></button>
                </div>

                <div className={styles.controls}>
                    <div className={styles.badge}>
                        Target: {instanceMeta.version} ({instanceMeta.loader})
                    </div>
                </div>

                <div className={styles.subControls}>
                    <input
                        className={styles.versionSearch}
                        placeholder="Search versions..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    <label className={styles.checkbox}>
                        <input type="checkbox" checked={filterAll} onChange={e => setFilterAll(e.target.checked)} />
                        Show all
                    </label>
                </div>

                <div className={styles.list}>
                    {loading ? (
                        <div className={styles.loading}>
                            <Loader2 className={styles.spin} size={24} /> Loading versions...
                        </div>
                    ) : compatibleVersions.length === 0 ? (
                        <div className={styles.empty}>
                            <AlertTriangle size={32} />
                            <p>No compatible versions found for {instanceMeta.version}.</p>
                            <button className={styles.linkBtn} onClick={() => setFilterAll(true)}>Show all versions</button>
                        </div>
                    ) : compatibleVersions.length === 0 && filterAll ? ( // Show "no results" if filterAll is true and still no versions
                        <div className={styles.empty}>
                            <AlertTriangle size={32} />
                            <p>No versions found for this mod.</p>
                        </div>
                    ) : (
                        compatibleVersions.map((v: any) => {
                            const file = v.files.find((f: any) => f.primary) || v.files[0];
                            return (
                                <div key={v.id} className={styles.item}>
                                    <div className={styles.info}>
                                        <div className={styles.verName}>
                                            {v.version_number === v.name ? v.version_number : `${v.version_number} (${v.name})`}
                                        </div>
                                        <div className={styles.verMeta}>
                                            {v.loaders.join(', ')} • {v.game_versions.join(', ')}
                                        </div>
                                        {v.needsWarning && (
                                            <div className={styles.verWarning} style={{
                                                color: '#ff8800',
                                                fontSize: '0.75rem',
                                                marginTop: 4,
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 4
                                            }}>
                                                <AlertTriangle size={12} />
                                                <span>Version detect failed, likely imported manually. Please consider that mods, shader packs, or resource packs may conflict.</span>
                                            </div>
                                        )}
                                    </div>
                                    <button
                                        className={styles.pBtn}
                                        onClick={() => onInstall(v, file)}
                                    >
                                        <Download size={16} /> Install
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};
