import React, { useState, useEffect, useCallback } from 'react';
import { InstanceApi } from '../api/instances';
import { VersionsApi, MinecraftVersion } from '../api/versions';
import styles from './CreateInstanceModal.module.css';
import { CustomSelect } from './common/CustomSelect';
import { X, ChevronRight, ChevronLeft, Search, Download, Check, WifiOff, Package, Sparkles, Loader2, CheckCircle } from 'lucide-react';

interface CreateInstanceModalProps {
    onClose: () => void;
    onCreated: () => void;
}

type LoaderType = 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt';
type VersionFilter = 'release' | 'snapshot' | 'all';

interface PresetMod {
    project_id: string;
    title: string;
    description: string;
    icon_url?: string;
    downloads: number;
    compatible: boolean;
    version_id?: string;
}

export const CreateInstanceModal: React.FC<CreateInstanceModalProps> = ({ onClose, onCreated }) => {
    
    // Step state
    const [step, setStep] = useState(1);

    // Step 1: Config
    const [name, setName] = useState('');
    const [version, setVersion] = useState('');
    const [loader, setLoader] = useState<LoaderType>('vanilla');
    const [versionFilter, setVersionFilter] = useState<VersionFilter>('release');
    const [versions, setVersions] = useState<MinecraftVersion[]>([]);
    const [fetchingVersions, setFetchingVersions] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [fabricLoaders, setFabricLoaders] = useState<{ id: string; stable: boolean }[]>([]);
    const [extraLoaders, setExtraLoaders] = useState<string[]>([]);
    const [selectedLoaderVersion, setSelectedLoaderVersion] = useState('');
    const [loadingLoaders, setLoadingLoaders] = useState(false);

    // Step 2: Mod Presets
    const [modQuery, setModQuery] = useState('');
    const [searchResults, setSearchResults] = useState<PresetMod[]>([]);
    const [searchingMods, setSearchingMods] = useState(false);
    const [selectedMods, setSelectedMods] = useState<PresetMod[]>([]);
    const [isOnline, setIsOnline] = useState(navigator.onLine);

    // Step 3: Creating
    const [creating, setCreating] = useState(false);
    const [createProgress, setCreateProgress] = useState(0);
    const [createStatus, setCreateStatus] = useState('');

    // Internet check
    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Ensure only available loaders are selected
    useEffect(() => {
        const disabledLoaders = ['forge', 'neoforge', 'quilt'];
        if (disabledLoaders.includes(loader)) {
            setLoader('vanilla');
        }
    }, [loader]);

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
                setExtraLoaders([]);
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
                } else if (loader === 'forge') {
                    const loaders = await InstanceApi.getForgeLoaders(version);
                    setExtraLoaders(loaders);
                    if (loaders.length > 0) setSelectedLoaderVersion(loaders[0]);
                } else if (loader === 'neoforge') {
                    const loaders = await InstanceApi.getNeoForgeLoaders(version);
                    setExtraLoaders(loaders);
                    if (loaders.length > 0) setSelectedLoaderVersion(loaders[0]);
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
            const facets = [];
            facets.push(`["versions:${version}"]`);
            facets.push(`["project_type:mod"]`);
            if (loader !== 'vanilla') {
                facets.push(`["categories:${loader}"]`);
            }

            const res = await window.ipcRenderer.invoke('platform:search', q, 'mod', { version, loader });
            const hits: PresetMod[] = (res.hits || []).map((h: any) => ({
                project_id: h.project_id,
                title: h.title,
                description: h.description,
                icon_url: h.icon_url,
                downloads: h.downloads || 0,
                compatible: true, // It came back from a version-filtered search
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
                        await window.ipcRenderer.invoke('mods:install', result.instance.id, skinVersions[0].id);
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
                    setCreateStatus(`Installing ${mod.title} (${i + 1}/${selectedMods.length})...`);
                    try {
                        const modVersions = await window.ipcRenderer.invoke('platform:get-versions', mod.project_id, 'mod', { version, loader });
                        if (modVersions.length > 0) {
                            await window.ipcRenderer.invoke('mods:install', result.instance.id, modVersions[0].id);
                        }
                    } catch (e) {
                        console.error(`Failed to install mod ${mod.title}:`, e);
                    }
                }
            }

            setCreateProgress(100);
            setCreateStatus('Complete!');
            onCreated();
            onClose();
        } catch (e) {
            setError('An unexpected error occurred.');
        } finally {
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

    const filteredVersions = versions.filter(v => {
        if (versionFilter === 'release') return v.type === 'release';
        if (versionFilter === 'snapshot') return v.type === 'snapshot';
        return true;
    });

    const versionOptions = filteredVersions.slice(0, 50).map(v => ({
        value: v.id,
        label: `${v.type === 'release' ? '' : `[${v.type}] `}${v.id}`
    }));

    const loaderOptions = [
        { value: 'vanilla', label: 'Vanilla' },
        { value: 'fabric', label: 'Fabric' },
        { value: 'forge', label: 'Forge', disabled: true, badge: 'Coming Soon' },
        { value: 'neoforge', label: 'NeoForge', disabled: true, badge: 'Coming Soon' },
        { value: 'quilt', label: 'Quilt', disabled: true, badge: 'Coming Soon' }
    ];

    const filterOptions = [
        { value: 'release', label: 'Releases' },
        { value: 'snapshot', label: 'Snapshots' },
        { value: 'all', label: 'All Versions' }
    ];

    const formatNumber = (n: number) => {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
        if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
        return n.toString();
    };

    const stepLabels = showModStep
        ? ['Configure', 'Mod Presets', 'Review']
        : ['Configure', 'Review'];

    const effectiveStepIndex = showModStep
        ? step - 1
        : (step === 1 ? 0 : 1);

    return (
        <div className={styles.overlay} onClick={onClose}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        <Sparkles size={22} className={styles.headerLogo} />
                        <h2>New Profile</h2>
                    </div>
                    <button onClick={onClose} className={styles.closeIcon}><X size={20} /></button>
                </div>

                {/* Step Indicator */}
                <div className={styles.stepper}>
                    {stepLabels.map((label, idx) => (
                        <div key={label} className={`${styles.stepItem} ${idx <= effectiveStepIndex ? styles.stepActive : ''} ${idx < effectiveStepIndex ? styles.stepCompleted : ''}`}>
                            <div className={styles.stepDot}>
                                {idx < effectiveStepIndex ? <Check size={12} /> : idx + 1}
                            </div>
                            <span className={styles.stepLabel}>{label}</span>
                            {idx < stepLabels.length - 1 && <div className={styles.stepLine} />}
                        </div>
                    ))}
                </div>

                {/* Step Content */}
                <div className={styles.stepContent}>
                    {/* Step 1: Config */}
                    {step === 1 && (
                        <div className={styles.stepPanel}>
                            <div className={styles.formGroup}>
                                <label>Profile Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="My Survival World"
                                    autoFocus
                                    className={styles.input}
                                />
                            </div>

                            <div className={styles.formRow}>
                                <div className={styles.formGroup}>
                                    <label>Mod Loader</label>
                                    <CustomSelect
                                        value={loader}
                                        onChange={(v) => setLoader(v as LoaderType)}
                                        options={loaderOptions}
                                        placeholder="Select loader"
                                    />
                                </div>
                                <div className={styles.formGroup}>
                                    <label>Version Filter</label>
                                    <CustomSelect
                                        value={versionFilter}
                                        onChange={(v) => setVersionFilter(v as VersionFilter)}
                                        options={filterOptions}
                                        placeholder="Filter"
                                    />
                                </div>
                            </div>

                            <div className={styles.formGroup}>
                                <label>Game Version</label>
                                {fetchingVersions ? (
                                    <div className={styles.loadingVersions}>Loading versions...</div>
                                ) : (
                                    <CustomSelect
                                        value={version}
                                        onChange={setVersion}
                                        options={versionOptions}
                                        placeholder="Select a version"
                                    />
                                )}
                            </div>

                            {(loader === 'fabric' || loader === 'quilt') && (
                                <div className={styles.formGroup}>
                                    <label>{loader.charAt(0).toUpperCase() + loader.slice(1)} Loader Version</label>
                                    {loadingLoaders ? (
                                        <div className={styles.loadingVersions}>Fetching loaders...</div>
                                    ) : (
                                        <CustomSelect
                                            value={selectedLoaderVersion}
                                            onChange={setSelectedLoaderVersion}
                                            options={fabricLoaders.map(l => ({
                                                value: l.id,
                                                label: `${l.id} ${l.stable ? '(Stable)' : ''}`
                                            }))}
                                            placeholder="Select loader version"
                                        />
                                    )}
                                </div>
                            )}

                            {(loader === 'forge' || loader === 'neoforge') && (
                                <div className={styles.formGroup}>
                                    <label>{loader.charAt(0).toUpperCase() + loader.slice(1)} Version</label>
                                    {loadingLoaders ? (
                                        <div className={styles.loadingVersions}>Fetching loaders...</div>
                                    ) : (
                                        <CustomSelect
                                            value={selectedLoaderVersion}
                                            onChange={setSelectedLoaderVersion}
                                            options={extraLoaders.map(l => ({
                                                value: l,
                                                label: l
                                            }))}
                                            placeholder={`Select ${loader} version`}
                                        />
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 2: Mod Presets */}
                    {step === 2 && (
                        <div className={styles.stepPanel}>
                            {!isOnline ? (
                                <div className={styles.offlineBanner}>
                                    <WifiOff size={32} />
                                    <h3>Internet Required</h3>
                                    <p>Connect to the internet to browse and select mod presets.</p>
                                    <button className={styles.skipBtn} onClick={() => setStep(3)}>
                                        Skip to Review
                                    </button>
                                </div>
                            ) : (
                                <div className={styles.presetLayout}>
                                    <div className={styles.presetSearch}>
                                        <div className={styles.searchWrapper}>
                                            <Search size={16} className={styles.searchIcon} />
                                            <input
                                                className={styles.searchInput}
                                                placeholder={`Search mods for ${version}...`}
                                                value={modQuery}
                                                onChange={(e) => setModQuery(e.target.value)}
                                                autoFocus
                                            />
                                        </div>
                                        {selectedMods.length > 0 && (
                                            <div className={styles.selectedCount}>
                                                <CheckCircle size={14} />
                                                {selectedMods.length} selected
                                            </div>
                                        )}
                                    </div>

                                    <div className={styles.modGrid}>
                                        {searchingMods ? (
                                            Array(6).fill(0).map((_, i) => (
                                                <div key={i} className={styles.modCardSkeleton} />
                                            ))
                                        ) : searchResults.length === 0 ? (
                                            <div className={styles.emptyMods}>
                                                <Package size={36} strokeWidth={1.2} />
                                                <p>No mods found</p>
                                            </div>
                                        ) : (
                                            searchResults.map(mod => (
                                                <div
                                                    key={mod.project_id}
                                                    className={`${styles.modCard} ${isModSelected(mod.project_id) ? styles.modCardSelected : ''}`}
                                                    onClick={() => toggleMod(mod)}
                                                >
                                                    <div className={styles.modIcon}>
                                                        {mod.icon_url ? (
                                                            <img src={mod.icon_url} alt="" />
                                                        ) : (
                                                            <Package size={20} />
                                                        )}
                                                    </div>
                                                    <div className={styles.modInfo}>
                                                        <span className={styles.modTitle}>{mod.title}</span>
                                                        <span className={styles.modDesc}>{mod.description}</span>
                                                        <div className={styles.modMeta}>
                                                            <span><Download size={11} /> {formatNumber(mod.downloads)}</span>
                                                            <span className={styles.compatBadge}>
                                                                <Check size={10} /> {version}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className={styles.modCheck}>
                                                        {isModSelected(mod.project_id) && <CheckCircle size={18} />}
                                                    </div>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Step 3: Review */}
                    {step === 3 && (
                        <div className={styles.stepPanel}>
                            <div className={styles.reviewSection}>
                                <h3 className={styles.reviewTitle}>Instance Configuration</h3>
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
                                        <span className={styles.reviewValue}>{loader}{selectedLoaderVersion ? ` (${selectedLoaderVersion})` : ''}</span>
                                    </div>
                                </div>
                            </div>

                            {selectedMods.length > 0 && (
                                <div className={styles.reviewSection}>
                                    <h3 className={styles.reviewTitle}>
                                        Selected Mods
                                        <span className={styles.modCount}>{selectedMods.length}</span>
                                    </h3>
                                    <div className={styles.reviewModList}>
                                        {selectedMods.map(mod => (
                                            <div key={mod.project_id} className={styles.reviewModItem}>
                                                <div className={styles.reviewModIcon}>
                                                    {mod.icon_url ? <img src={mod.icon_url} alt="" /> : <Package size={16} />}
                                                </div>
                                                <span>{mod.title}</span>
                                                <button
                                                    className={styles.removeModBtn}
                                                    onClick={() => toggleMod(mod)}
                                                    title="Remove"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {creating && (
                                <div className={styles.creatingProgress}>
                                    <Loader2 size={18} className={styles.spinner} />
                                    <div className={styles.progressInfo}>
                                        <span className={styles.statusText}>{createStatus}</span>
                                        <div className={styles.progressBar}>
                                            <div className={styles.progressFill} style={{ width: `${createProgress}%` }} />
                                        </div>
                                        <span className={styles.percentText}>{Math.round(createProgress)}%</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {error && <div className={styles.error}>{error}</div>}

                <div className={styles.actions}>
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
                        <button
                            className={styles.createBtn}
                            onClick={handleCreate}
                            disabled={creating || !name || !version}
                        >
                            {creating ? (
                                <><Loader2 size={16} className={styles.spinner} /> Creating...</>
                            ) : (
                                <><Sparkles size={16} /> Create Profile</>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};
