import React, { useState, useEffect } from 'react';
import styles from './Onboarding.module.css';
import { 
    ChevronLeft,
    ChevronRight,
    FolderOpen, 
    HardDrive,
    CheckCircle, 
    Sparkles,
    Monitor,
    Gamepad2,
    Settings,
    ArrowRight,
    X,
    Minus,
    HardDrive as DriveIcon,
    Folder,
    Package
} from 'lucide-react';
import logo from '../assets/logo.png';
import heroBg from '../assets/login_bg.png';

interface OnboardingProps {
    onComplete: () => void;
}

export const Onboarding: React.FC<OnboardingProps> = ({ onComplete }) => {
    const [currentStep, setCurrentStep] = useState(0);
    const [dataPath, setDataPath] = useState('');
    const [defaultPath, setDefaultPath] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Get default path on mount
        const loadInitialData = async () => {
            try {
                const result = await window.ipcRenderer.invoke('config:is-first-launch');
                if (result.isFirstLaunch) {
                    setDefaultPath(result.defaultPath);
                    setDataPath(result.defaultPath);
                }
            } catch (e) {
                console.error('Failed to get initial data:', e);
            }
        };
        loadInitialData();
    }, []);



    const handleSelectPath = async () => {
        setError(null);
        try {
            const result = await window.ipcRenderer.invoke('config:select-data-path');
            if (result.success) {
                setDataPath(result.path);
            }
        } catch (e) {
            setError('Failed to select folder');
        }
    };

    const handleComplete = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await window.ipcRenderer.invoke('config:complete-onboarding', dataPath);
            if (result.success) {
                onComplete();
            } else {
                setError(result.error || 'Failed to complete setup');
            }
        } catch (e) {
            setError('An unexpected error occurred');
        } finally {
            setIsLoading(false);
        }
    };

    const handleMinimize = () => {
        window.ipcRenderer.send('onboarding:minimize');
    };

    const handleClose = () => {
        window.ipcRenderer.send('onboarding:close');
    };

    const nextStep = () => {
        if (currentStep < 2) {
            setCurrentStep(currentStep + 1);
        }
    };

    const prevStep = () => {
        if (currentStep > 0) {
            setCurrentStep(currentStep - 1);
        }
    };

    const renderWelcomeStep = () => (
        <div className={styles.stepContent}>
            <div className={styles.welcomeHeader}>
                <div className={styles.logoWrapper}>
                    <img src={logo} alt="Whoap" className={styles.logo} />
                    <div className={styles.logoGlow}></div>
                </div>
                <h1 className={styles.welcomeTitle}>
                    Welcome to <span className={styles.highlight}>Whoap</span>
                </h1>
                <p className={styles.welcomeSubtitle}>
                    The Next Level Minecraft Launcher
                </p>
            </div>

            <div className={styles.featuresGrid}>
                <div className={styles.featureCard}>
                    <div className={styles.featureIcon}>
                        <Gamepad2 size={24} />
                    </div>
                    <h3>Multiple Instances</h3>
                    <p>Create and manage separate game profiles with isolated mods and saves</p>
                </div>
                <div className={styles.featureCard}>
                    <div className={styles.featureIcon}>
                        <Package size={24} />
                    </div>
                    <h3>Mod Management</h3>
                    <p>Easy mod and modpack installation from Modrinth and CurseForge</p>
                </div>
                <div className={styles.featureCard}>
                    <div className={styles.featureIcon}>
                        <Settings size={24} />
                    </div>
                    <h3>Performance</h3>
                    <p>Optimized JVM presets from Potato to Extreme for any system</p>
                </div>
                <div className={styles.featureCard}>
                    <div className={styles.featureIcon}>
                        <Monitor size={24} />
                    </div>
                    <h3>Modern UI</h3>
                    <p>Beautiful dark interface with 3D skin viewer and cloud sync</p>
                </div>
            </div>

            <button className={styles.primaryButton} onClick={nextStep}>
                Get Started
                <ArrowRight size={20} />
            </button>
        </div>
    );

    const renderStorageStep = () => (
        <div className={styles.stepContent}>
            <div className={styles.stepHeader}>
                <div className={styles.stepIcon}>
                    <HardDrive size={32} />
                </div>
                <h2>Choose Storage Location</h2>
                <p>Select where Whoap will store your game data, instances, and settings</p>
            </div>

            <div className={styles.storageContainer}>
                <div className={styles.currentPathCard}>
                    <div className={styles.pathHeader}>
                        <Folder size={20} />
                        <span>Data Folder Location</span>
                    </div>
                    <div className={styles.pathDisplay}>
                        <code>{dataPath || defaultPath}</code>
                    </div>
                    <div className={styles.pathActions}>
                        <button className={styles.secondaryButton} onClick={handleSelectPath}>
                            <FolderOpen size={16} />
                            Browse...
                        </button>
                        <button 
                            className={styles.textButton}
                            onClick={() => setDataPath(defaultPath)}
                        >
                            Reset to Default
                        </button>
                    </div>
                </div>

                <div className={styles.folderStructure}>
                    <h4>Folder Structure</h4>
                    <div className={styles.folderTree}>
                        <div className={styles.folderItem}>
                            <DriveIcon size={16} />
                            <span>.whoap</span>
                        </div>
                        <div className={styles.folderChildren}>
                            <div className={styles.folderItem}>
                                <Folder size={16} />
                                <span>instances/</span>
                                <span className={styles.folderDesc}>Game profiles & mods</span>
                            </div>
                            <div className={styles.folderItem}>
                                <Folder size={16} />
                                <span>gamedata/</span>
                                <span className={styles.folderDesc}>Libraries & assets</span>
                            </div>
                            <div className={styles.folderItem}>
                                <Folder size={16} />
                                <span>skins/</span>
                                <span className={styles.folderDesc}>Custom skins</span>
                            </div>
                            <div className={styles.folderItem}>
                                <Folder size={16} />
                                <span>capes/</span>
                                <span className={styles.folderDesc}>Custom capes</span>
                            </div>
                            <div className={styles.folderItem}>
                                <Folder size={16} />
                                <span>runtimes/</span>
                                <span className={styles.folderDesc}>Java installations</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className={styles.infoBox}>
                    <Sparkles size={16} />
                    <p>You can change this location later in Settings {'>'} Launcher Paths</p>
                </div>
            </div>

            {error && (
                <div className={styles.errorMessage}>
                    {error}
                </div>
            )}

            <div className={styles.stepActions}>
                <button className={styles.ghostButton} onClick={prevStep}>
                    <ChevronLeft size={20} />
                    Back
                </button>
                <button className={styles.primaryButton} onClick={nextStep}>
                    Continue
                    <ChevronRight size={20} />
                </button>
            </div>
        </div>
    );

    const renderReadyStep = () => (
        <div className={styles.stepContent}>
            <div className={styles.stepHeader}>
                <div className={styles.successIcon}>
                    <CheckCircle size={48} />
                </div>
                <h2>You're All Set!</h2>
                <p>Whoap is ready to use. Let's start your Minecraft adventure.</p>
            </div>

            <div className={styles.summaryCard}>
                <h4>Configuration Summary</h4>
                <div className={styles.summaryItem}>
                    <span>Data Location:</span>
                    <code>{dataPath}</code>
                </div>
                <div className={styles.summaryItem}>
                    <span>Default RAM:</span>
                    <span>4 GB (Standard Preset)</span>
                </div>
                <div className={styles.summaryItem}>
                    <span>Auth Methods:</span>
                    <span>Microsoft, Whoap Cloud, Offline</span>
                </div>
            </div>

            <div className={styles.tipsCard}>
                <h4>Quick Tips</h4>
                <ul>
                    <li>Click &quot;New Profile&quot; to create your first instance</li>
                    <li>Use the Library tab to install mods and resource packs</li>
                    <li>Customize your skin in the Profile section</li>
                    <li>Adjust performance settings anytime in Settings</li>
                </ul>
            </div>

            {error && (
                <div className={styles.errorMessage}>
                    {error}
                </div>
            )}

            <div className={styles.stepActions}>
                <button className={styles.ghostButton} onClick={prevStep}>
                    <ChevronLeft size={20} />
                    Back
                </button>
                <button 
                    className={styles.primaryButton} 
                    onClick={handleComplete}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <>
                            <div className={styles.spinner} />
                            Setting up...
                        </>
                    ) : (
                        <>
                            Launch Whoap
                            <Sparkles size={20} />
                        </>
                    )}
                </button>
            </div>
        </div>
    );

    return (
        <div className={styles.container}>
            {/* Background */}
            <div className={styles.background} style={{ backgroundImage: `url(${heroBg})` }} />
            
            {/* Title Bar */}
            <div className={styles.titleBar}>
                <div className={styles.titleBarLeft}>
                    <img src={logo} alt="Whoap" className={styles.titleBarLogo} />
                    <span className={styles.titleBarText}>Whoap Setup</span>
                </div>
                <div className={styles.titleBarControls}>
                    <button className={styles.controlBtn} onClick={handleMinimize}>
                        <Minus size={14} />
                    </button>
                    <button className={styles.controlBtn} onClick={handleClose}>
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className={styles.content}>
                {/* Step Content */}
                <div className={styles.stepWrapper}>
                    {currentStep === 0 && renderWelcomeStep()}
                    {currentStep === 1 && renderStorageStep()}
                    {currentStep === 2 && renderReadyStep()}
                </div>
            </div>

            {/* Footer */}
            <div className={styles.footer}>
                <span>v2.3.7</span>
                <span className={styles.footerDivider}>/</span>
                <span>Built with ❤️</span>
            </div>
        </div>
    );
};
