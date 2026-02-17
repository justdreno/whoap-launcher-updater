import { useState, useEffect } from 'react';
import styles from './Settings.module.css';
import { Skeleton } from '../components/Skeleton';
import { PageHeader } from '../components/PageHeader';
import {
    FolderOpen,
    RotateCcw,
    Coffee,
    Cpu,
    EyeOff,
    Minimize2,
    Monitor,
    RefreshCw,
    Trash2,
    AlertTriangle,
    FolderSearch,
    X,
    CheckCircle,
    Box,
    Globe,
    Sparkles,
    HardDrive,
    Gamepad2
} from 'lucide-react';
import { VersionScannerModal } from '../components/VersionScannerModal';
import { useToast } from '../context/ToastContext';
import { useAnimation } from '../context/AnimationContext';
import { ProcessingModal } from '../components/ProcessingModal';

interface ProxyConfig {
    enabled: boolean;
    host: string;
    port: number;
    type: 'http' | 'socks';
    username?: string;
    password?: string;
}

interface JavaPaths {
    [version: string]: string;
}

interface Config {
    dataPath: string;
    gamePath: string;
    instancesPath: string;
    skinsPath: string;
    capesPath: string;
    runtimesPath: string;
    minRam: number;
    maxRam: number;
    javaPaths: JavaPaths;
    launchBehavior: 'hide' | 'minimize' | 'keep';
    showConsoleOnLaunch: boolean;
    jvmPreset: 'potato' | 'standard' | 'pro' | 'extreme' | 'custom';
    jvmArgs: string[];
    proxy: ProxyConfig;
    onboardingCompleted: boolean;
}

interface StorageInfo {
    dataPath: string;
    sizes: {
        total: number;
        instances: number;
        gameData: number;
        skins: number;
        capes: number;
    };
}

const JAVA_VERSIONS = ['8', '11', '16', '17', '21'];

function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export const Settings = () => {
    const [config, setConfig] = useState<Config | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showResetModal, setShowResetModal] = useState(false);
    const [showVersionScanner, setShowVersionScanner] = useState(false);
    const [storageInfo, setStorageInfo] = useState<StorageInfo | null>(null);
    const { showToast } = useToast();
    const { animationsEnabled, setAnimationsEnabled } = useAnimation();
    const [discordEnabled, setDiscordEnabled] = useState(true);
    const [discordStatus, setDiscordStatus] = useState<{ connected: boolean; currentState: string }>({ connected: false, currentState: 'none' });
    const [processing, setProcessing] = useState<{ message: string; subMessage?: string; progress?: number } | null>(null);

    useEffect(() => {
        const handleProgress = (_: any, data: any) => {
            setProcessing(prev => prev ? { ...prev, subMessage: data.status, progress: data.progress } : null);
        };
        window.ipcRenderer.on('instance:import-progress', handleProgress);
        return () => {
            window.ipcRenderer.off('instance:import-progress', handleProgress);
        };
    }, []);

    useEffect(() => {
        const loadConfig = async () => {
            try {
                const cfg = await window.ipcRenderer.invoke('config:get');
                setConfig(cfg);

                // Load storage info
                try {
                    const storageResult = await window.ipcRenderer.invoke('config:get-storage-info');
                    if (storageResult.success) {
                        setStorageInfo(storageResult);
                    }
                } catch (err) {
                    console.error("Failed to load storage info:", err);
                }

                // Load Discord RPC status
                try {
                    const discordResult = await window.ipcRenderer.invoke('discord:get-status');
                    setDiscordEnabled(discordResult.enabled);
                    setDiscordStatus({ connected: discordResult.connected, currentState: discordResult.currentState });
                } catch (err) {
                    console.error("Failed to load Discord status:", err);
                }
            } catch (error) {
                console.error("Failed to load config", error);
            } finally {
                setLoading(false);
            }
        };
        loadConfig();
    }, []);

    const updateConfig = async (key: keyof Config, value: any) => {
        if (!config) return;
        setSaving(true);
        try {
            // Special handling for presets: update RAM values too
            if (key === 'jvmPreset' && value !== 'custom') {
                let min = config.minRam;
                let max = config.maxRam;

                if (value === 'potato') {
                    min = 1024; max = 2048;
                } else if (value === 'standard') {
                    min = 1024; max = 4096;
                } else if (value === 'pro') {
                    min = 2048; max = 8192;
                } else if (value === 'extreme') {
                    min = 4096; max = 12288;
                }

                await window.ipcRenderer.invoke('config:set', 'minRam', min);
                await window.ipcRenderer.invoke('config:set', 'maxRam', max);
                await window.ipcRenderer.invoke('config:set', 'jvmPreset', value);

                const newConfig = { ...config, jvmPreset: value, minRam: min, maxRam: max };
                setConfig(newConfig);
            } else {
                // Standard single-key update
                await window.ipcRenderer.invoke('config:set', key, value);
                const newConfig = { ...config, [key]: value };
                setConfig(newConfig);
            }
        } catch (e) {
            console.error("Failed to save setting", e);
        } finally {
            setSaving(false);
        }
    };

    const handleToggleDiscord = async (enabled: boolean) => {
        try {
            const result = await window.ipcRenderer.invoke('discord:toggle', enabled);
            if (result.success) {
                setDiscordEnabled(result.enabled);
                showToast(result.enabled ? 'Discord Rich Presence enabled' : 'Discord Rich Presence disabled', 'success');
            }
        } catch (e) {
            console.error("Failed to toggle Discord RPC:", e);
            showToast('Failed to toggle Discord Rich Presence', 'error');
        }
    };

    const handleChangeGamePath = async () => {
        const result = await window.ipcRenderer.invoke('config:set-game-path');
        if (result.success && config) {
            setConfig({ ...config, gamePath: result.path });
            setShowVersionScanner(true);
        }
    };

    const handleReset = async (mode: 'database' | 'full') => {
        localStorage.clear();
        await window.ipcRenderer.invoke('app:reset', mode);
    };

    const handleVersionImport = async (versions: any[]) => {
        if (versions.length === 0) return;
        setProcessing({ message: 'Importing Versions', subMessage: 'Initializing...', progress: 0 });
        try {
            const versionIds = versions.map(v => v.id);
            const result = await window.ipcRenderer.invoke('instance:import-external', versionIds);
            if (result.success) {
                const successCount = result.results.filter((r: any) => r.success).length;
                const failCount = result.results.length - successCount;
                if (failCount === 0) {
                    showToast(`Successfully imported ${successCount} versions!`, 'success');
                } else if (successCount > 0) {
                    showToast(`Imported ${successCount} versions (${failCount} failed)`, 'warning');
                } else {
                    showToast('Failed to import versions.', 'error');
                }
            } else {
                showToast(result.error || 'Import failed', 'error');
            }
        } catch (e) {
            console.error(e);
            showToast('An error occurred during import', 'error');
        } finally {
            setProcessing(null);
        }
    };

    const handleSelectJava = async (version: string) => {
        const result = await window.ipcRenderer.invoke('config:select-java', version);
        if (result.success && config) {
            const newPaths = { ...(config.javaPaths || {}), [version]: result.path };
            setConfig({ ...config, javaPaths: newPaths });
        }
    };

    const handleResetJava = async (version: string) => {
        await window.ipcRenderer.invoke('config:reset-java', version);
        if (config) {
            const newPaths = { ...(config.javaPaths || {}) };
            delete newPaths[version];
            setConfig({ ...config, javaPaths: newPaths });
        }
    };

    const handleResetAllJava = async () => {
        await window.ipcRenderer.invoke('config:reset-java');
        if (config) {
            setConfig({ ...config, javaPaths: {} });
        }
    };



    if (loading) {
        return (
            <div className={styles.container}>
                <PageHeader title="Settings" description="Configure your launcher preferences, paths, and performance." />
                <div className={styles.content}>
                    <Skeleton width="100%" height={120} />
                    <Skeleton width="100%" height={120} style={{ marginTop: 20 }} />
                </div>
            </div>
        );
    }

    if (!config) return <div className={styles.container}>Failed to load settings.</div>;

    return (
        <div className={styles.container}>
            <PageHeader
                title="Settings"
                description="Configure your launcher preferences, paths, and performance."
            />
            {saving && <div className={styles.savingBadge}><RefreshCw size={12} className={styles.spin} /> Saving...</div>}

            <div className={styles.content}>
                {/* Paths Section */}
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h3><FolderOpen size={18} /> Launcher Paths</h3>
                    </div>
                    
                    {/* Data Path - Main Storage Location */}
                    <div className={styles.settingRow + ' ' + styles.importantRow}>
                        <div className={styles.labelCol}>
                            <span className={styles.label}>Whoap Data Folder</span>
                            <span className={styles.hint}>Main storage for instances, game data, skins, and settings. Changing this requires a restart.</span>
                        </div>
                        <div className={styles.controlCol}>
                            <div className={`${styles.pathBox} ${styles.importantPath}`}>
                                {config.dataPath || 'Not set'}
                                {config.dataPath?.includes('.whoap') && (
                                    <span className={styles.defaultBadge}>Default</span>
                                )}
                            </div>
                            <button className={styles.btn} onClick={async () => {
                                const result = await window.ipcRenderer.invoke('config:select-data-path');
                                if (result.success) {
                                    const changeResult = await window.ipcRenderer.invoke('config:change-data-path', result.path);
                                    if (changeResult.success) {
                                        const newConfig = { 
                                            ...config, 
                                            dataPath: result.path,
                                            gamePath: result.path + '/gamedata',
                                            instancesPath: result.path + '/instances'
                                        };
                                        setConfig(newConfig);
                                        showToast('Data folder changed. Please restart the launcher.', 'warning');
                                    }
                                }
                            }}>
                                <FolderOpen size={16} /> Change
                            </button>
                            {!config.dataPath?.includes('.whoap') && (
                                <button 
                                    className={styles.secondaryBtn} 
                                    onClick={async () => {
                                        const result = await window.ipcRenderer.invoke('config:reset-data-path');
                                        if (result.success) {
                                            const newConfig = { 
                                                ...config, 
                                                dataPath: result.path,
                                                gamePath: result.path + '/gamedata',
                                                instancesPath: result.path + '/instances'
                                            };
                                            setConfig(newConfig);
                                            showToast('Reset to default (.whoap). Please restart.', 'warning');
                                        }
                                    }}
                                    title="Reset to default"
                                >
                                    <RotateCcw size={16} /> Reset
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Storage Usage Info */}
                    {storageInfo && (
                        <div className={styles.storageInfoCard}>
                            <div className={styles.storageHeader}>
                                <HardDrive size={16} />
                                <span>Storage Usage</span>
                            </div>
                            <div className={styles.storageGrid}>
                                <div className={styles.storageItem}>
                                    <span className={styles.storageLabel}>Total</span>
                                    <span className={styles.storageValue}>{formatBytes(storageInfo.sizes.total)}</span>
                                </div>
                                <div className={styles.storageItem}>
                                    <span className={styles.storageLabel}>Instances</span>
                                    <span className={styles.storageValue}>{formatBytes(storageInfo.sizes.instances)}</span>
                                </div>
                                <div className={styles.storageItem}>
                                    <span className={styles.storageLabel}>Game Data</span>
                                    <span className={styles.storageValue}>{formatBytes(storageInfo.sizes.gameData)}</span>
                                </div>
                                <div className={styles.storageItem}>
                                    <span className={styles.storageLabel}>Skins & Capes</span>
                                    <span className={styles.storageValue}>{formatBytes(storageInfo.sizes.skins + storageInfo.sizes.capes)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div className={styles.settingRow}>
                        <div className={styles.labelCol}>
                            <span className={styles.label}>Instances Folder</span>
                            <span className={styles.hint}>Where game instances and mods are stored.</span>
                        </div>
                        <div className={styles.controlCol}>
                            <div className={styles.pathBox}>{config.instancesPath}</div>
                            <button className={styles.btn} onClick={async () => {
                                const result = await window.ipcRenderer.invoke('config:set-instances-path');
                                if (result.success) {
                                    const newConfig = { ...config, instancesPath: result.path };
                                    setConfig(newConfig);
                                    showToast('Instances folder changed. Restart required for changes to take effect.', 'warning');
                                }
                            }}>
                                <FolderOpen size={16} /> Browse
                            </button>
                        </div>
                    </div>
                    <div className={styles.settingRow}>
                        <div className={styles.labelCol}>
                            <span className={styles.label}>Game Data Path</span>
                            <span className={styles.hint}>Where game assets and libraries are stored.</span>
                        </div>
                        <div className={styles.controlCol}>
                            <div className={styles.pathBox}>{config.gamePath}</div>
                            <button className={styles.btn} onClick={handleChangeGamePath}><FolderOpen size={16} /> Browse</button>
                        </div>
                    </div>
                </section>

                {/* Performance & JVM Section */}
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h3><Cpu size={18} /> Performance & JVM</h3>
                        <span className={styles.presetBadge}>{config.jvmPreset.toUpperCase()} PROFILE</span>
                    </div>

                    <div className={styles.presetGrid}>
                        {[
                            { id: 'potato', name: 'Potato', icon: <Box size={20} />, desc: 'Low-end. Max 2GB RAM. Basic flags.' },
                            { id: 'standard', name: 'Standard', icon: <Monitor size={20} />, desc: 'Balanced. 4GB RAM. Standard G1GC.' },
                            { id: 'pro', name: 'Pro', icon: <RotateCcw size={20} />, desc: 'Power user. 8GB RAM. Aikar flags.' },
                            { id: 'extreme', name: 'Extreme', icon: <AlertTriangle size={20} />, desc: 'Peak power. 12GB+ RAM. Expert flags.' },
                            { id: 'custom', name: 'Custom', icon: <Cpu size={20} />, desc: 'Full manual control. Edit args below.' },
                        ].map(preset => (
                            <div
                                key={preset.id}
                                className={`${styles.presetCard} ${config.jvmPreset === preset.id ? styles.presetActive : ''}`}
                                onClick={() => updateConfig('jvmPreset', preset.id)}
                            >
                                <div className={styles.presetIcon}>{preset.icon}</div>
                                <div className={styles.presetInfo}>
                                    <div className={styles.presetName}>{preset.name}</div>
                                    <div className={styles.presetDesc}>{preset.desc}</div>
                                </div>
                                {config.jvmPreset === preset.id && <div className={styles.checkMark}><CheckCircle size={14} /></div>}
                            </div>
                        ))}
                    </div>

                    <div className={styles.settingRow}>
                        <div className={styles.labelCol}>
                            <span className={styles.label}>Minimum RAM</span>
                        </div>
                        <div className={styles.sliderCol}>
                            <span className={styles.rangeValue}>{config.minRam} MB</span>
                            <input
                                type="range"
                                min="512"
                                max={config.maxRam}
                                step="256"
                                value={config.minRam}
                                disabled={config.jvmPreset !== 'custom'}
                                onChange={(e) => updateConfig('minRam', parseInt(e.target.value))}
                                className={styles.slider}
                            />
                        </div>
                    </div>
                    <div className={styles.settingRow}>
                        <div className={styles.labelCol}>
                            <span className={styles.label}>Maximum RAM</span>
                        </div>
                        <div className={styles.sliderCol}>
                            <span className={styles.rangeValue}>{config.maxRam} MB ({(config.maxRam / 1024).toFixed(1)} GB)</span>
                            <input
                                type="range"
                                min={config.minRam}
                                max="32768"
                                step="256"
                                value={config.maxRam}
                                disabled={config.jvmPreset !== 'custom'}
                                onChange={(e) => updateConfig('maxRam', parseInt(e.target.value))}
                                className={styles.slider}
                            />
                        </div>
                    </div>

                    {config.jvmPreset === 'custom' && (
                        <div className={styles.customArgsRow}>
                            <div className={styles.labelCol}>
                                <span className={styles.label}>Custom JVM Arguments</span>
                                <span className={styles.hint}>One argument per line. Use with caution.</span>
                            </div>
                            <textarea
                                className={styles.argsArea}
                                placeholder="-XX:+UseZGC&#10;-Xlog:gc*"
                                value={config.jvmArgs.join('\n')}
                                onChange={(e) => updateConfig('jvmArgs', e.target.value.split('\n').filter(a => a.trim()))}
                            />
                        </div>
                    )}
                </section>

                {/* Java Section */}
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h3><Coffee size={18} /> Java Runtime</h3>
                        <button className={styles.resetAllBtn} onClick={handleResetAllJava}><RotateCcw size={14} /> Reset All</button>
                    </div>
                    {JAVA_VERSIONS.map(version => (
                        <div key={version} className={styles.settingRow}>
                            <div className={styles.labelCol}>
                                <span className={styles.label}>Java {version}</span>
                            </div>
                            <div className={styles.controlCol}>
                                <div className={`${styles.pathBox} ${!config.javaPaths?.[version] ? styles.autoPath : ''}`}>
                                    {config.javaPaths?.[version] || <><RefreshCw size={14} /> Auto-detect</>}
                                </div>
                                <button className={styles.iconBtn} onClick={() => handleSelectJava(version)}><FolderOpen size={16} /></button>
                                {config.javaPaths?.[version] && (
                                    <button className={styles.dangerIconBtn} onClick={() => handleResetJava(version)}><RotateCcw size={16} /></button>
                                )}
                            </div>
                        </div>
                    ))}
                </section>

                {/* Launch Behavior Section */}
                <section className={styles.section}>
                    <h3><Monitor size={18} /> Launch Behavior</h3>
                    <div className={styles.settingRow}>
                        <div className={styles.labelCol}>
                            <span className={styles.label}>When game starts</span>
                        </div>
                        <div className={styles.radioGroup}>
                            <label className={`${styles.radioOption} ${config.launchBehavior === 'hide' ? styles.selected : ''}`}>
                                <input type="radio" name="launchBehavior" value="hide" checked={config.launchBehavior === 'hide'} onChange={() => updateConfig('launchBehavior', 'hide')} />
                                <EyeOff size={16} /> Hide
                            </label>
                            <label className={`${styles.radioOption} ${config.launchBehavior === 'minimize' ? styles.selected : ''}`}>
                                <input type="radio" name="launchBehavior" value="minimize" checked={config.launchBehavior === 'minimize'} onChange={() => updateConfig('launchBehavior', 'minimize')} />
                                <Minimize2 size={16} /> Minimize
                            </label>
                            <label className={`${styles.radioOption} ${config.launchBehavior === 'keep' ? styles.selected : ''}`}>
                                <input type="radio" name="launchBehavior" value="keep" checked={config.launchBehavior === 'keep'} onChange={() => updateConfig('launchBehavior', 'keep')} />
                                <Monitor size={16} /> Keep Open
                            </label>
                        </div>
                    </div>
                    <div className={styles.settingRow}>
                        <div className={styles.labelCol}>
                            <span className={styles.label}>Show Game Console</span>
                            <span className={styles.hint}>Display log output when game launches.</span>
                        </div>
                        <label className={styles.toggle}>
                            <input type="checkbox" checked={config.showConsoleOnLaunch} onChange={(e) => updateConfig('showConsoleOnLaunch', e.target.checked)} />
                            <span className={styles.toggleSlider}></span>
                        </label>
                    </div>
                </section>

                {/* UI Preferences Section */}
                <section className={styles.section}>
                    <h3><Sparkles size={18} /> UI Preferences</h3>
                    <div className={styles.settingRow}>
                        <div className={styles.labelCol}>
                            <span className={styles.label}>Enable Animations</span>
                            <span className={styles.hint}>Toggle page animations and transitions.</span>
                        </div>
                        <label className={styles.toggle}>
                            <input 
                                type="checkbox" 
                                checked={animationsEnabled} 
                                onChange={(e) => setAnimationsEnabled(e.target.checked)} 
                            />
                            <span className={styles.toggleSlider}></span>
                        </label>
                    </div>
                </section>

                {/* Discord Rich Presence Section */}
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h3><Gamepad2 size={18} /> Discord Rich Presence</h3>
                        <label className={styles.toggle}>
                            <input
                                type="checkbox"
                                checked={discordEnabled}
                                onChange={(e) => handleToggleDiscord(e.target.checked)}
                            />
                            <span className={styles.toggleSlider}></span>
                        </label>
                    </div>
                    
                    <div className={styles.settingRow}>
                        <div className={styles.labelCol}>
                            <span className={styles.label}>Status</span>
                            <span className={styles.hint}>
                                {discordEnabled 
                                    ? (discordStatus.connected 
                                        ? `Connected - ${discordStatus.currentState}` 
                                        : 'Connecting to Discord...')
                                    : 'Discord Rich Presence is disabled'}
                            </span>
                        </div>
                        <div className={`${styles.statusBadge} ${discordStatus.connected ? styles.statusConnected : styles.statusDisconnected}`}>
                            {discordStatus.connected ? 'Connected' : discordEnabled ? 'Connecting...' : 'Disabled'}
                        </div>
                    </div>
                    
                    <div className={styles.hintText}>
                        Show your Minecraft activity on Discord. Displays current game, version, and launcher status.
                    </div>
                </section>

                {/* Network & Proxy Section */}
                <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                        <h3><Globe size={18} /> Network & Proxy</h3>
                        <label className={styles.toggle}>
                            <input
                                type="checkbox"
                                checked={config.proxy.enabled}
                                onChange={(e) => updateConfig('proxy', { ...config.proxy, enabled: e.target.checked })}
                            />
                            <span className={styles.toggleSlider}></span>
                        </label>
                    </div>

                    <div className={config.proxy.enabled ? styles.proxyControls : styles.proxyControlsDisabled}>
                        <div className={styles.settingRow}>
                            <div className={styles.labelCol}>
                                <span className={styles.label}>Proxy Type</span>
                            </div>
                            <div className={styles.radioGroup}>
                                <label className={`${styles.radioOption} ${config.proxy.type === 'http' ? styles.selected : ''}`}>
                                    <input
                                        type="radio"
                                        name="proxyType"
                                        value="http"
                                        checked={config.proxy.type === 'http'}
                                        onChange={() => updateConfig('proxy', { ...config.proxy, type: 'http' })}
                                    />
                                    HTTP
                                </label>
                                <label className={`${styles.radioOption} ${config.proxy.type === 'socks' ? styles.selected : ''}`}>
                                    <input
                                        type="radio"
                                        name="proxyType"
                                        value="socks"
                                        checked={config.proxy.type === 'socks'}
                                        onChange={() => updateConfig('proxy', { ...config.proxy, type: 'socks' })}
                                    />
                                    SOCKS5
                                </label>
                            </div>
                        </div>

                        <div className={styles.proxyGrid}>
                            <div className={styles.inputGroup}>
                                <label>Host / IP</label>
                                <input
                                    type="text"
                                    className={styles.input}
                                    placeholder="e.g. 127.0.0.1"
                                    value={config.proxy.host}
                                    onChange={(e) => updateConfig('proxy', { ...config.proxy, host: e.target.value })}
                                />
                            </div>
                            <div className={styles.inputGroup}>
                                <label>Port</label>
                                <input
                                    type="number"
                                    className={styles.input}
                                    placeholder="8080"
                                    value={config.proxy.port}
                                    onChange={(e) => updateConfig('proxy', { ...config.proxy, port: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>

                        <div className={styles.hintText}>
                            <AlertTriangle size={12} />
                            Game traffic will be routed through this proxy using JVM system properties.
                        </div>
                    </div>
                </section>

                {/* Danger Zone */}
                <section className={`${styles.section} ${styles.dangerSection}`}>
                    <h3><Trash2 size={18} /> Danger Zone</h3>
                    <div className={styles.settingRow}>
                        <div className={styles.labelCol}>
                            <span className={styles.label}>Reset Launcher</span>
                            <span className={styles.hint}>Clear all settings and restart fresh.</span>
                        </div>
                        <button className={styles.dangerBtn} onClick={() => setShowResetModal(true)}>Reset Launcher</button>
                    </div>
                    <div className={styles.settingRow}>
                        <div className={styles.labelCol}>
                            <span className={styles.label}>Scan External Versions</span>
                            <span className={styles.hint}>Import versions from TLauncher or other launchers.</span>
                        </div>
                        <button className={styles.btn} onClick={() => setShowVersionScanner(true)}><FolderSearch size={16} /> Scan</button>
                    </div>
                </section>
            </div>

            {/* Reset Modal */}
            {showResetModal && (
                <div className={styles.modalOverlay} onClick={() => setShowResetModal(false)}>
                    <div className={styles.modal} onClick={e => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <AlertTriangle size={24} color="#ef4444" />
                            <h3>Reset Launcher</h3>
                            <button className={styles.closeBtn} onClick={() => setShowResetModal(false)}><X size={18} /></button>
                        </div>
                        <div className={styles.modalBody}>
                            <p>Choose reset mode:</p>
                            <div className={styles.resetOption} onClick={() => handleReset('database')}>
                                <strong>Clear Settings Only</strong>
                                <span>Clears configurations and accounts. Game files are kept.</span>
                            </div>
                            <div className={`${styles.resetOption} ${styles.dangerOption}`} onClick={() => handleReset('full')}>
                                <strong>Full Reset</strong>
                                <span>Deletes everything including instances.</span>
                            </div>
                        </div>
                        <button className={styles.cancelBtn} onClick={() => setShowResetModal(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {showVersionScanner && (
                <VersionScannerModal onClose={() => setShowVersionScanner(false)} onImport={handleVersionImport} />
            )}

            {processing && (
                <ProcessingModal message={processing.message} subMessage={processing.subMessage} progress={processing.progress} />
            )}
        </div>
    );
};
