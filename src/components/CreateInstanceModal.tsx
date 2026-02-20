import React, { useState, useEffect, useCallback } from 'react';
import { InstanceApi } from '../api/instances';
import { VersionsApi, MinecraftVersion } from '../api/versions';
import styles from './CreateInstanceModal.module.css';
import { X, ChevronRight, ChevronLeft, Search, Download, Check, Package, Loader2, Box, WifiOff } from 'lucide-react';
import { useOfflineStatus } from '../hooks/useOfflineStatus';
import { OfflineButton } from './OfflineButton';

interface CreateInstanceModalProps {
    onClose: () => void;
    onCreated: (instance?: any) => void;
}

type LoaderType = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt';

interface PresetMod {
    project_id: string;
    title: string;
    description: string;
    icon_url?: string;
    downloads: number;
    compatible: boolean;
}

export const CreateInstanceModal: React.FC<CreateInstanceModalProps> = ({ onClose, onCreated }) => {
    const [step, setStep] = useState(1);
    const isOffline = useOfflineStatus();

    // Step 1: Config
    const [name, setName] = useState('');
    const [version, setVersion] = useState('');
    const [loader, setLoader] = useState<LoaderType>('vanilla');
    const [versions, setVersions] = useState<MinecraftVersion[]>([]);
    const [fetchingVersions, setFetchingVersions] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fabricLoaders, setFabricLoaders] = useState<{ id: string; stable: boolean }[]>([]);
    const [selectedLoaderVersion, setSelectedLoaderVersion] = useState('');
    const [loadingLoaders, setLoadingLoaders] = useState(false);

    // Step 2: Mod Presets
    const [modQuery, setModQuery] = useState('');
    const [searchResults, setSearchResults] = useState<PresetMod[]>([]);
    const [searchingMods, setSearchingMods] = useState(false);
    const [selectedMods, setSelectedMods] = useState<PresetMod[]>([]);

    // Step 3: Creating
    const [creating, setCreating] = useState(false);
    const [createProgress, setCreateProgress] = useState(0);
    const [createStatus, setCreateStatus] = useState('');

    // Load versions
    useEffect(() => {
        const loadVersions = async () => {
            setFetchingVersions(true);
            try {
                const data = await VersionsApi.getVanilla();
                setVersions(data.versions);
                if (data.latest?.release) {
                    setVersion(data.latest.release);
                }
            } catch (e) {
                console.error(e);
                setError("Failed to load versions.");
            } finally {
                setFetchingVersions(false);
            }
        };
        loadVersions();
    }, []);

    // Load loaders when version/loader changes
    useEffect(() => {
        const fetchLoaders = async () => {
            if (loader === 'vanilla' || !version) {
                setFabricLoaders([]);
                setSelectedLoaderVersion('');
                return;
            }

            setLoadingLoaders(true);
            setSelectedLoaderVersion('');
            setError(null);

            try {
                if (loader === 'fabric') {
                    const loaders = await InstanceApi.getFabricLoaders(version);
                    setFabricLoaders(loaders);
                    if (loaders.length > 0) {
                        const stable = loaders.find(l => l.stable);
                        setSelectedLoaderVersion(stable ? stable.id : loaders[0].id);
                    }
                } else if (loader === 'quilt') {
                    const loaders = await InstanceApi.getQuiltLoaders(version);
                    setFabricLoaders(loaders);
                    if (loaders.length > 0) {
                        const stable = loaders.find(l => l.stable);
                        setSelectedLoaderVersion(stable ? stable.id : loaders[0].id);
                    }
                }
            } catch (e) {
                console.error("[CreateInstance] Failed to fetch loaders:", e);
                setError(`Failed to fetch ${loader} loaders.`);
            } finally {
                setLoadingLoaders(false);
            }
        };
        fetchLoaders();
    }, [loader, version]);

    // Mod search
    const searchMods = useCallback(async (q: string) => {
        if (!version) return;
        setSearchingMods(true);
        try {
            const res = await window.ipcRenderer.invoke('platform:search', q, 'mod', { version, loader });
            const hits: PresetMod[] = (res.hits || []).map((h: any) => ({
                project_id: h.project_id,
                title: h.title,
                description: h.description,
                icon_url: h.icon_url,
                downloads: h.downloads || 0,
                compatible: true,
            }));
            setSearchResults(hits);
        } catch (e) {
            console.error('Mod search failed:', e);
        } finally {
            setSearchingMods(false);
        }
    }, [version, loader]);

    // Debounced mod search
    useEffect(() => {
        if (step !== 2) return;
        const timer = setTimeout(() => {
            searchMods(modQuery);
        }, 400);
        return () => clearTimeout(timer);
    }, [modQuery, step, searchMods]);

    // Load featured mods when entering step 2
    useEffect(() => {
        if (step === 2) {
            searchMods('');
        }
    }, [step]);

    const toggleMod = (mod: PresetMod) => {
        setSelectedMods(prev => {
            const exists = prev.find(m => m.project_id === mod.project_id);
            if (exists) return prev.filter(m => m.project_id !== mod.project_id);
            return [...prev, mod];
        });
    };

    const isModSelected = (projectId: string) => selectedMods.some(m => m.project_id === projectId);

    const handleCreate = async () => {
        setCreating(true);
        setCreateProgress(0);
        setCreateStatus('Creating instance...');
        setError(null);

        const handleProgress = (_: any, status: any) => {
            if (status.status === 'downloading') {
                setCreateStatus(`Downloading ${status.modName}...`);
            } else if (status.status === 'installed') {
                setCreateStatus(`Installed ${status.modName}`);
            } else if (status.status === 'failed') {
                setCreateStatus(`Failed to install ${status.modName}`);
            }
        };

        window.ipcRenderer.on('platform:install-progress', handleProgress);

        try {
            setCreateProgress(10);
            const result = await InstanceApi.create(name, version, loader, selectedLoaderVersion);

            if (!result.success) {
                setError(result.error || 'Failed to create instance.');
                setCreating(false);
                return;
            }

            setCreateProgress(30);
            setCreateStatus('Installing loader...');

            // Auto-install Skin Loader (CustomSkinLoader) for Fabric
            if (loader === 'fabric' && result.instance?.id) {
                try {
                    const skinVersions = await window.ipcRenderer.invoke('platform:get-versions', 'customskinloader', 'mod', { version, loader });
                    if (skinVersions.length > 0) {
                        await window.ipcRenderer.invoke('platform:install', result.instance.id, skinVersions[0].id, 'mod');
                    }
                } catch (e) {
                    console.error("Failed to auto-install skin loader:", e);
                }
            }

            // Install selected mods
            if (selectedMods.length > 0 && result.instance?.id) {
                setCreateStatus(`Installing ${selectedMods.length} mods...`);
                for (let i = 0; i < selectedMods.length; i++) {
                    const mod = selectedMods[i];
                    const progress = 40 + ((i + 1) / selectedMods.length) * 50;
                    setCreateProgress(progress);
                    setCreateStatus(`Preparing ${mod.title}...`);
                    try {
                        const modVersions = await window.ipcRenderer.invoke('platform:get-versions', mod.project_id, 'mod', { version, loader });
                        if (modVersions.length > 0) {
                            await window.ipcRenderer.invoke('platform:install', result.instance.id, modVersions[0].id, 'mod');
                        }
                    } catch (e) {
                        console.error(`Failed to install mod ${mod.title}:`, e);
                    }
                }
            }

            setCreateProgress(100);
            setCreateStatus('Complete!');
            onCreated(result.instance);
            onClose();
        } catch (e) {
            setError('An unexpected error occurred.');
        } finally {
            window.ipcRenderer.off('platform:install-progress', handleProgress);
            setCreating(false);
        }
    };

    const canProceedStep1 = name.trim() && version && !fetchingVersions;
    const showModStep = loader !== 'vanilla';

    const handleNext = () => {
        if (step === 1) {
            if (showModStep) setStep(2);
            else setStep(3);
        } else if (step === 2) {
            setStep(3);
        }
    };

    const handleBack = () => {
        if (step === 3) {
            if (showModStep) setStep(2);
            else setStep(1);
        } else if (step === 2) {
            setStep(1);
        }
    };

    const formatNumber = (n: number) => {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
        return n.toString();
    };

    const stepLabels = showModStep
        ? ['Configure', 'Mods', 'Review']
        : ['Configure', 'Review'];

    const effectiveStepIndex = showModStep
        ? step - 1
        : (step === 1 ? 0 : 1);

    return (
        <div className={styles.overlay} onClick={creating ? undefined : onClose} style={creating ? { cursor: 'default' } : {}}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <div className={styles.headerIcon}>
                            <Box size={18} />
                        </div>
                        <h2>Create Profile</h2>
                    </div>
                    <button onClick={creating ? undefined : onClose} className={styles.closeBtn} disabled={creating}>
                        <X size={18} />
                    </button>
                </div>

                {/* Stepper */}
                <div className={styles.stepper}>
                    {stepLabels.map((label, idx) => (
                        <React.Fragment key={label}>
                            <div className={`${styles.stepItem} ${idx <= effectiveStepIndex ? styles.stepActive : ''} ${idx < effectiveStepIndex ? styles.stepCompleted : ''}`}>
                                <div className={styles.stepDot}>
                                    {idx < effectiveStepIndex ? <Check size={12} /> : idx + 1}
                                </div>
                                <span>{label}</span>
                            </div>
                            {idx < stepLabels.length - 1 && <div className={styles.stepLine} />}
                        </React.Fragment>
                    ))}
                </div>

                {/* Content */}
                <div className={styles.content}>
                    {step === 1 && (
                        <div className={styles.panel}>
                            <div className={styles.formGroup}>
                                <label>Profile Name</label>
                                <input
                                    type="text"
                                    className={styles.input}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="My Survival World"
                                    autoFocus
                                />
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Mod Loader</label>
                                    <select
                                        className={styles.select}
                                        value={loader}
                                        onChange={(e) => setLoader(e.target.value as LoaderType)}
                                    >
                                        <option value="vanilla">Vanilla</option>
                                        <option value="fabric">Fabric</option>
                                        <option value="forge" disabled>Forge (Soon)</option>
                                        <option value="neoforge" disabled>NeoForge (Soon)</option>
                                        <option value="quilt" disabled>Quilt (Soon)</option>
                                    </select>
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Game Version</label>
                                    {fetchingVersions ? (
                                        <div className={styles.loadingText}>Loading...</div>
                                    ) : (
                                        <select
                                            className={styles.select}
                                            value={version}
                                            onChange={(e) => setVersion(e.target.value)}
                                        >
                                            {versions.filter(v => v.type === 'release').slice(0, 50).map(v => (
                                                <option key={v.id} value={v.id}>{v.id}</option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            </div>

                            {(loader === 'fabric' || loader === 'quilt') && (
                                <div className={styles.formGroup}>
                                    <label>Loader Version</label>
                                    {loadingLoaders ? (
                                        <div className={styles.loadingText}>Fetching...</div>
                                    ) : (
                                        <select
                                            className={styles.select}
                                            value={selectedLoaderVersion}
                                            onChange={(e) => setSelectedLoaderVersion(e.target.value)}
                                        >
                                            {fabricLoaders.map(l => (
                                                <option key={l.id} value={l.id}>
                                                    {l.id} {l.stable ? '(Stable)' : ''}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 2 && (
                        <div className={styles.panel}>
                            {isOffline && (
                                <div className={styles.offlineBanner}>
                                    <WifiOff size={16} />
                                    <span>You are offline. Mod search requires internet connection.</span>
                                </div>
                            )}
                            <div className={styles.modSearch}>
                                <Search size={16} />
                                <input
                                    type="text"
                                    placeholder={isOffline ? 'Internet required to search mods...' : `Search mods for ${version}...`}
                                    value={modQuery}
                                    onChange={(e) => setModQuery(e.target.value)}
                                    autoFocus
                                    disabled={isOffline}
                                />
                                {selectedMods.length > 0 && (
                                    <div className={styles.selectedCount}>
                                        <Check size={12} />
                                        {selectedMods.length}
                                    </div>
                                )}
                            </div>

                            <div className={styles.modGrid}>
                                {searchingMods ? (
                                    Array(4).fill(0).map((_, i) => (
                                        <div key={i} className={styles.modCard} style={{ opacity: 0.5 }}>
                                            <div className={styles.modIcon} />
                                            <div className={styles.modInfo}>
                                                <div className={styles.modName}>Loading...</div>
                                            </div>
                                        </div>
                                    ))
                                ) : searchResults.length === 0 ? (
                                    <div className={styles.modEmpty}>
                                        {isOffline ? (
                                            <>
                                                <WifiOff size={32} />
                                                <p>Mod search requires internet connection</p>
                                                <span style={{ color: '#666', fontSize: '12px' }}>Create the instance and install mods later when online</span>
                                            </>
                                        ) : (
                                            <>
                                                <Package size={32} />
                                                <p>No mods found</p>
                                            </>
                                        )}
                                    </div>
                                ) : (
                                    searchResults.map(mod => (
                                        <div
                                            key={mod.project_id}
                                            className={`${styles.modCard} ${isModSelected(mod.project_id) ? styles.selected : ''}`}
                                            onClick={() => toggleMod(mod)}
                                        >
                                            <div className={styles.modIcon}>
                                                {mod.icon_url ? (
                                                    <img src={mod.icon_url} alt="" />
                                                ) : (
                                                    <Package size={18} />
                                                )}
                                            </div>
                                            <div className={styles.modInfo}>
                                                <div className={styles.modName}>{mod.title}</div>
                                                <div className={styles.modDesc}>{mod.description}</div>
                                                <div className={styles.modMeta}>
                                                    <Download size={10} />
                                                    {formatNumber(mod.downloads)}
                                                </div>
                                            </div>
                                            {isModSelected(mod.project_id) && (
                                                <div className={styles.modCheck}>
                                                    <Check size={16} />
                                                </div>
                                            )}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {step === 3 && (
                        <div className={styles.panel}>
                            <div className={styles.reviewSection}>
                                <h3 className={styles.reviewTitle}>Configuration</h3>
                                <div className={styles.reviewGrid}>
                                    <div className={styles.reviewItem}>
                                        <span className={styles.reviewLabel}>Name</span>
                                        <span className={styles.reviewValue}>{name}</span>
                                    </div>
                                    <div className={styles.reviewItem}>
                                        <span className={styles.reviewLabel}>Version</span>
                                        <span className={styles.reviewValue}>{version}</span>
                                    </div>
                                    <div className={styles.reviewItem}>
                                        <span className={styles.reviewLabel}>Loader</span>
                                        <span className={styles.reviewValue}>
                                            {loader}{selectedLoaderVersion ? ` (${selectedLoaderVersion})` : ''}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {selectedMods.length > 0 && (
                                <div className={styles.reviewSection}>
                                    <h3 className={styles.reviewTitle}>
                                        Selected Mods
                                        <span className={styles.badge}>{selectedMods.length}</span>
                                    </h3>
                                    <div className={styles.modList}>
                                        {selectedMods.map(mod => (
                                            <div key={mod.project_id} className={styles.modItem}>
                                                <div className={styles.modItemIcon}>
                                                    {mod.icon_url ? <img src={mod.icon_url} alt="" /> : <Package size={14} />}
                                                </div>
                                                <span>{mod.title}</span>
                                                <button onClick={() => toggleMod(mod)}>
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {creating && (
                                <div className={styles.progress}>
                                    <Loader2 size={20} className={styles.spinner} />
                                    <div className={styles.progressInfo}>
                                        <div className={styles.statusText}>{createStatus}</div>
                                        <div className={styles.progressBar}>
                                            <div className={styles.progressFill} style={{ width: `${createProgress}%` }} />
                                        </div>
                                        <div className={styles.percent}>{Math.round(createProgress)}%</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {error && <div className={styles.error}>{error}</div>}

                <div className={styles.footer}>
                    {step > 1 ? (
                        <button className={styles.backBtn} onClick={handleBack} disabled={creating}>
                            <ChevronLeft size={16} /> Back
                        </button>
                    ) : (
                        <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                    )}

                    {step < 3 ? (
                        <button
                            className={styles.nextBtn}
                            onClick={handleNext}
                            disabled={!canProceedStep1 && step === 1}
                        >
                            {step === 1 && !showModStep ? 'Review' : 'Next'}
                            <ChevronRight size={16} />
                        </button>
                    ) : (
                        <OfflineButton
                            className={styles.createBtn}
                            onClick={handleCreate}
                            disabled={creating || !name || !version}
                            offlineDisabled={selectedMods.length > 0}
                            offlineTooltip="Internet connection required to download mods"
                        >
                            {creating ? (
                                <><Loader2 size={16} className={styles.spinner} /> Creating...</>
                            ) : (
                                'Create Profile'
                            )}
                        </OfflineButton>
                    )}
                </div>
            </div>
        </div>
    );
};
