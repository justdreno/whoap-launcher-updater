import React, { useState, useEffect, useRef } from 'react';
import styles from './Login.module.css';
import { AccountManager, StoredAccount } from '../utils/AccountManager';
import { 
    LogOut, 
    ChevronDown, 
    Play, 
    ChevronUp, 
    CheckCircle, 
    User,
    Mail,
    Lock,
    Eye,
    EyeOff,
    AlertCircle,
    Gamepad2,
    Sparkles,
    ArrowRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import loginBg from '../assets/login_bg.png';
import { UserAvatar } from '../components/UserAvatar';

interface LoginProps {
    onLoginSuccess: (profile: any) => void;
    onOfflineLogin: (username: string) => void;
}

type AuthMode = 'whoap' | 'microsoft' | 'offline';

interface FormErrors {
    email?: string;
    password?: string;
    username?: string;
    general?: string;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, onOfflineLogin }) => {
    const [authMode, setAuthMode] = useState<AuthMode>('microsoft');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [errors, setErrors] = useState<FormErrors>({});
    const [accounts, setAccounts] = useState<StoredAccount[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<StoredAccount | null>(null);
    const [showAccountDropdown, setShowAccountDropdown] = useState(false);
    const [animationState, setAnimationState] = useState<'idle' | 'loading' | 'success'>('idle');

    const [isRegistering, setIsRegistering] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [rememberMe, setRememberMe] = useState(true);
    const [verificationSent, setVerificationSent] = useState(false);
    const [passwordStrength, setPasswordStrength] = useState(0);

    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const stored = AccountManager.getAccounts();
        setAccounts(stored);
        const active = AccountManager.getActive();
        if (active) setSelectedAccount(active);
        else if (stored.length > 0) setSelectedAccount(stored[0]);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowAccountDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        if (!password) {
            setPasswordStrength(0);
            return;
        }
        let strength = 0;
        if (password.length >= 8) strength += 1;
        if (password.match(/[a-z]/) && password.match(/[A-Z]/)) strength += 1;
        if (password.match(/[0-9]/)) strength += 1;
        if (password.match(/[^a-zA-Z0-9]/)) strength += 1;
        setPasswordStrength(strength);
    }, [password]);

    const validateForm = (): boolean => {
        const newErrors: FormErrors = {};

        if (authMode === 'whoap') {
            if (!email) {
                newErrors.email = 'Email is required';
            } else if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
                newErrors.email = 'Please enter a valid email';
            }

            if (!password) {
                newErrors.password = 'Password is required';
            } else if (isRegistering && password.length < 8) {
                newErrors.password = 'Password must be at least 8 characters';
            }

            if (isRegistering && !username.trim()) {
                newErrors.username = 'Username is required';
            }
        }

        if (authMode === 'offline' && !username.trim()) {
            newErrors.username = 'Username is required';
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSuccess = (profile: any, type: any) => {
        const account: StoredAccount = {
            name: profile.name,
            uuid: profile.uuid,
            token: profile.token,
            refreshToken: profile.refreshToken,
            type,
            preferredSkin: profile.preferredSkin
        };
        AccountManager.addAccount(account);
        setAnimationState('success');
        setTimeout(() => {
            onLoginSuccess({ ...profile, type });
        }, 500);
    };

    const handleMicrosoftLogin = async () => {
        setIsLoggingIn(true);
        setAnimationState('loading');
        setErrors({});
        try {
            const result = await window.ipcRenderer.invoke('auth:login-microsoft');
            if (result.success) {
                handleSuccess(result.profile, 'microsoft');
            } else {
                setErrors({ general: result.error || 'Login failed' });
                setAnimationState('idle');
            }
        } catch (err) {
            setErrors({ general: 'An unexpected error occurred' });
            setAnimationState('idle');
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleOfflineLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsLoggingIn(true);
        setAnimationState('loading');
        try {
            const result = await window.ipcRenderer.invoke('auth:login-offline', username);
            if (result.success) {
                onOfflineLogin(result.profile.name);
                handleSuccess(result.profile, 'offline');
            }
        } catch (err) {
            setErrors({ general: 'Offline login failed' });
            setAnimationState('idle');
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleWhoapAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!validateForm()) return;

        setIsLoggingIn(true);
        setAnimationState('loading');
        setErrors({});

        try {
            if (isRegistering) {
                const { CloudManager } = await import('../utils/CloudManager');
                const isTaken = await CloudManager.checkUsernameExists(username);
                if (isTaken) {
                    setErrors({ username: 'Username is already taken' });
                    setIsLoggingIn(false);
                    setAnimationState('idle');
                    return;
                }

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        data: { display_name: username }
                    }
                });

                if (error) throw error;

                if (data.user && !data.session) {
                    setVerificationSent(true);
                    setIsLoggingIn(false);
                    setAnimationState('idle');
                    return;
                }

                if (data.user) {
                    const displayName = username || data.user.user_metadata.display_name || email.split('@')[0];

                    await window.ipcRenderer.invoke('auth:save-whoap-session', {
                        name: displayName,
                        uuid: data.user.id,
                        token: data.session?.access_token || 'whoap-token',
                        refreshToken: data.session?.refresh_token
                    });

                    handleSuccess({
                        name: displayName,
                        uuid: data.user.id,
                        token: data.session?.access_token || 'whoap-token'
                    }, 'whoap');
                }
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email,
                    password
                });

                if (error) {
                    if (error.message.includes("Email not confirmed")) {
                        setErrors({ general: 'Please verify your email before logging in' });
                    } else {
                        setErrors({ general: error.message });
                    }
                    setIsLoggingIn(false);
                    setAnimationState('idle');
                    return;
                }

                if (data.user) {
                    await window.ipcRenderer.invoke('auth:save-whoap-session', {
                        name: data.user.user_metadata.display_name || email.split('@')[0],
                        uuid: data.user.id,
                        token: data.session?.access_token,
                        refreshToken: data.session?.refresh_token
                    });

                    handleSuccess({
                        name: data.user.user_metadata.display_name || email.split('@')[0],
                        uuid: data.user.id,
                        token: data.session?.access_token
                    }, 'whoap');
                }
            }
        } catch (err: any) {
            setErrors({ general: err.message || 'Authentication failed' });
            setAnimationState('idle');
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleAccountSelect = async (account: StoredAccount) => {
        setIsLoggingIn(true);
        setAnimationState('loading');
        try {
            AccountManager.setActive(account.uuid);

            await window.ipcRenderer.invoke('auth:set-session', {
                type: account.type,
                name: account.name,
                uuid: account.uuid,
                token: account.token,
                refreshToken: account.refreshToken,
                expiresAt: account.expiresAt,
                preferredSkin: account.preferredSkin
            });

            if (account.type === 'whoap' && account.token && navigator.onLine) {
                try {
                    const { CloudManager } = await import('../utils/CloudManager');
                    const syncResult = await CloudManager.syncSession(account.token, account.refreshToken);

                    if (syncResult.success && syncResult.session) {
                        const updatedAccount: StoredAccount = {
                            ...account,
                            token: syncResult.session.access_token,
                            refreshToken: syncResult.session.refresh_token
                        };
                        AccountManager.addAccount(updatedAccount);

                        await window.ipcRenderer.invoke('auth:update-session', {
                            token: syncResult.session.access_token,
                            refreshToken: syncResult.session.refresh_token
                        });

                        onLoginSuccess({
                            name: account.name,
                            uuid: account.uuid,
                            token: syncResult.session.access_token,
                            type: account.type,
                            preferredSkin: account.preferredSkin
                        });
                        setIsLoggingIn(false);
                        return;
                    }
                } catch (e) {
                    console.warn("[Login] Session sync error:", e);
                }
            }

            onLoginSuccess({
                name: account.name,
                uuid: account.uuid,
                token: account.token,
                type: account.type,
                preferredSkin: account.preferredSkin
            });
        } catch (err) {
            console.error("Account selection failed", err);
            setErrors({ general: 'Failed to switch account' });
            setAnimationState('idle');
        } finally {
            setIsLoggingIn(false);
        }
    };

    const playWithAccount = async () => {
        if (!selectedAccount) return;
        handleAccountSelect(selectedAccount);
    };

    const removeAccount = (uuid: string) => {
        AccountManager.removeAccount(uuid);
        const remaining = AccountManager.getAccounts();
        setAccounts(remaining);
        if (selectedAccount?.uuid === uuid) {
            setSelectedAccount(remaining.length > 0 ? remaining[0] : null);
        }
    };

    const getStrengthColor = () => {
        switch (passwordStrength) {
            case 0: return '#333';
            case 1: return '#ff4444';
            case 2: return '#ff8800';
            case 3: return '#ffcc00';
            case 4: return '#44ff44';
            default: return '#333';
        }
    };

    const getStrengthLabel = () => {
        switch (passwordStrength) {
            case 0: return '';
            case 1: return 'Weak';
            case 2: return 'Fair';
            case 3: return 'Good';
            case 4: return 'Strong';
            default: return '';
        }
    };

    return (
        <div className={styles.container}>
            <div className={styles.bgAnimation}>
                <div className={styles.bgGradient} />
                <div className={styles.bgPattern} />
            </div>

            <div className={styles.card}>
                <div className={styles.authPanel}>
                    <div className={styles.logoSection}>
                        <div className={styles.logoIcon}>
                            <Gamepad2 size={32} />
                        </div>
                        <h1 className={styles.logoText}>
                            <span className={styles.logoPrimary}>Whoap</span>
                            <span className={styles.logoSecondary}>Launcher</span>
                        </h1>
                    </div>

                    <div className={styles.tabContainer}>
                        <button
                            className={`${styles.tab} ${authMode === 'microsoft' ? styles.active : ''}`}
                            onClick={() => { setAuthMode('microsoft'); setErrors({}); }}
                        >
                            <svg viewBox="0 0 21 21" width="16" height="16" style={{ marginRight: 8 }}>
                                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                            </svg>
                            Microsoft
                        </button>
                        <button
                            className={`${styles.tab} ${authMode === 'whoap' ? styles.active : ''}`}
                            onClick={() => { setAuthMode('whoap'); setErrors({}); }}
                        >
                            <Sparkles size={16} style={{ marginRight: 8 }} />
                            Whoap
                        </button>
                        <button
                            className={`${styles.tab} ${authMode === 'offline' ? styles.active : ''}`}
                            onClick={() => { setAuthMode('offline'); setErrors({}); }}
                        >
                            <User size={16} style={{ marginRight: 8 }} />
                            Offline
                        </button>
                    </div>

                    <div className={styles.formContainer}>
                        {authMode === 'microsoft' && (
                            <div className={`${styles.authForm} ${styles.fadeIn}`}>
                                <div className={styles.welcomeText}>
                                    <h2>Welcome Back</h2>
                                    <p>Sign in with your Microsoft account to play Minecraft</p>
                                </div>
                                
                                <button
                                    className={`${styles.microsoftBtn} ${animationState === 'loading' ? styles.loading : ''}`}
                                    onClick={handleMicrosoftLogin}
                                    disabled={isLoggingIn}
                                >
                                    {animationState === 'loading' ? (
                                        <div className={styles.spinner} />
                                    ) : (
                                        <>
                                            <svg viewBox="0 0 21 21" width="20" height="20">
                                                <rect x="1" y="1" width="9" height="9" fill="#fff" />
                                                <rect x="11" y="1" width="9" height="9" fill="#fff" />
                                                <rect x="1" y="11" width="9" height="9" fill="#fff" />
                                                <rect x="11" y="11" width="9" height="9" fill="#fff" />
                                            </svg>
                                            Continue with Microsoft
                                        </>
                                    )}
                                </button>

                                <div className={styles.helpText}>
                                    Don't have Minecraft? <a href="#" className={styles.link}>Get it here</a>
                                </div>
                            </div>
                        )}

                        {authMode === 'whoap' && (
                            <div className={`${styles.authForm} ${styles.fadeIn}`}>
                                {verificationSent ? (
                                    <div className={styles.verificationSent}>
                                        <div className={styles.verificationIcon}>✉️</div>
                                        <h2>Verify your email</h2>
                                        <p>We sent a verification link to <strong>{email}</strong></p>
                                        <button
                                            className={styles.primaryBtn}
                                            onClick={() => { setVerificationSent(false); setIsRegistering(false); }}
                                        >
                                            Back to Login
                                        </button>
                                    </div>
                                ) : (
                                    <>
                                        <div className={styles.welcomeText}>
                                            <h2>{isRegistering ? 'Create Account' : 'Welcome Back'}</h2>
                                            <p>{isRegistering ? 'Join the Whoap community today' : 'Sign in to your Whoap account'}</p>
                                        </div>

                                        <form onSubmit={handleWhoapAuth} className={styles.form}>
                                            {isRegistering && (
                                                <div className={styles.inputWrapper}>
                                                    <User size={18} className={styles.inputIcon} />
                                                    <input
                                                        type="text"
                                                        value={username}
                                                        onChange={e => { setUsername(e.target.value); setErrors({ ...errors, username: undefined }); }}
                                                        placeholder="Username"
                                                        className={`${styles.input} ${errors.username ? styles.error : ''}`}
                                                    />
                                                    {errors.username && (
                                                        <div className={styles.errorTooltip}>
                                                            <AlertCircle size={14} />
                                                            {errors.username}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className={styles.inputWrapper}>
                                                <Mail size={18} className={styles.inputIcon} />
                                                <input
                                                    type="email"
                                                    value={email}
                                                    onChange={e => { setEmail(e.target.value); setErrors({ ...errors, email: undefined }); }}
                                                    placeholder="Email address"
                                                    className={`${styles.input} ${errors.email ? styles.error : ''}`}
                                                />
                                                {errors.email && (
                                                    <div className={styles.errorTooltip}>
                                                        <AlertCircle size={14} />
                                                        {errors.email}
                                                    </div>
                                                )}
                                            </div>

                                            <div className={styles.inputWrapper}>
                                                <Lock size={18} className={styles.inputIcon} />
                                                <input
                                                    type={showPassword ? 'text' : 'password'}
                                                    value={password}
                                                    onChange={e => { setPassword(e.target.value); setErrors({ ...errors, password: undefined }); }}
                                                    placeholder="Password"
                                                    className={`${styles.input} ${errors.password ? styles.error : ''}`}
                                                />
                                                <button
                                                    type="button"
                                                    className={styles.eyeBtn}
                                                    onClick={() => setShowPassword(!showPassword)}
                                                >
                                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                                </button>
                                                {errors.password && (
                                                    <div className={styles.errorTooltip}>
                                                        <AlertCircle size={14} />
                                                        {errors.password}
                                                    </div>
                                                )}
                                            </div>

                                            {isRegistering && password && (
                                                <div className={styles.passwordStrength}>
                                                    <div className={styles.strengthBar}>
                                                        {[1, 2, 3, 4].map((level) => (
                                                            <div
                                                                key={level}
                                                                className={styles.strengthSegment}
                                                                style={{
                                                                    backgroundColor: passwordStrength >= level ? getStrengthColor() : '#333'
                                                                }}
                                                            />
                                                        ))}
                                                    </div>
                                                    <span style={{ color: getStrengthColor(), fontSize: 12 }}>
                                                        {getStrengthLabel()}
                                                    </span>
                                                </div>
                                            )}

                                            {!isRegistering && (
                                                <div className={styles.options}>
                                                    <label className={styles.checkbox}>
                                                        <input
                                                            type="checkbox"
                                                            checked={rememberMe}
                                                            onChange={e => setRememberMe(e.target.checked)}
                                                        />
                                                        <span>Remember me</span>
                                                    </label>
                                                    <button type="button" className={styles.forgotLink}>
                                                        Forgot password?
                                                    </button>
                                                </div>
                                            )}

                                            <button
                                                type="submit"
                                                className={`${styles.primaryBtn} ${animationState === 'loading' ? styles.loading : ''}`}
                                                disabled={isLoggingIn}
                                            >
                                                {animationState === 'loading' ? (
                                                    <div className={styles.spinner} />
                                                ) : (
                                                    <>
                                                        {isRegistering ? 'Create Account' : 'Sign In'}
                                                        <ArrowRight size={18} />
                                                    </>
                                                )}
                                            </button>
                                        </form>

                                        <div className={styles.switchMode}>
                                            {isRegistering ? 'Already have an account?' : "Don't have an account?"}
                                            <button
                                                className={styles.switchBtn}
                                                onClick={() => {
                                                    setIsRegistering(!isRegistering);
                                                    setErrors({});
                                                    setPassword('');
                                                }}
                                            >
                                                {isRegistering ? 'Sign In' : 'Create Account'}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {authMode === 'offline' && (
                            <div className={`${styles.authForm} ${styles.fadeIn}`}>
                                <div className={styles.welcomeText}>
                                    <h2>Play Offline</h2>
                                    <p>Create a local profile without online features</p>
                                </div>

                                <form onSubmit={handleOfflineLogin} className={styles.form}>
                                    <div className={styles.inputWrapper}>
                                        <User size={18} className={styles.inputIcon} />
                                        <input
                                            type="text"
                                            value={username}
                                            onChange={e => { setUsername(e.target.value); setErrors({ ...errors, username: undefined }); }}
                                            placeholder="Choose a username"
                                            className={`${styles.input} ${errors.username ? styles.error : ''}`}
                                        />
                                        {errors.username && (
                                            <div className={styles.errorTooltip}>
                                                <AlertCircle size={14} />
                                                {errors.username}
                                            </div>
                                        )}
                                    </div>

                                    <div className={styles.offlineInfo}>
                                        <AlertCircle size={16} />
                                        <span>Offline profiles don't have skins, capes, or multiplayer access</span>
                                    </div>

                                    <button
                                        type="submit"
                                        className={`${styles.primaryBtn} ${animationState === 'loading' ? styles.loading : ''}`}
                                        disabled={!username || isLoggingIn}
                                    >
                                        {animationState === 'loading' ? (
                                            <div className={styles.spinner} />
                                        ) : (
                                            <>
                                                Start Playing
                                                <Play size={18} fill="currentColor" />
                                            </>
                                        )}
                                    </button>
                                </form>
                            </div>
                        )}

                        {errors.general && (
                            <div className={styles.errorMessage}>
                                <AlertCircle size={18} />
                                <span>{errors.general}</span>
                            </div>
                        )}
                    </div>

                    {accounts.length > 0 && (
                        <div className={styles.accountsSection}>
                            <div className={styles.sectionTitle}>Saved Accounts</div>
                            
                            <div className={styles.accountSelector} ref={dropdownRef}>
                                <div 
                                    className={styles.accountCard}
                                    onClick={() => setShowAccountDropdown(!showAccountDropdown)}
                                >
                                    {selectedAccount && (
                                        <>
                                            <UserAvatar
                                                username={selectedAccount.name}
                                                preferredSkin={selectedAccount.preferredSkin}
                                                uuid={selectedAccount.uuid}
                                                className={styles.accountAvatar}
                                                accountType={selectedAccount.type as any}
                                            />
                                            <div className={styles.accountInfo}>
                                                <div className={styles.accountName}>{selectedAccount.name}</div>
                                                <div className={styles.accountType}>
                                                    {selectedAccount.type === 'offline' ? 'Offline' : 
                                                     selectedAccount.type === 'whoap' ? 'Whoap Cloud' : 'Microsoft'}
                                                </div>
                                            </div>
                                            {showAccountDropdown ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                        </>
                                    )}
                                </div>

                                {showAccountDropdown && (
                                    <div className={styles.accountsDropdown}>
                                        {accounts.map(acc => (
                                            <div
                                                key={acc.uuid}
                                                className={`${styles.accountOption} ${selectedAccount?.uuid === acc.uuid ? styles.selected : ''}`}
                                                onClick={() => {
                                                    setSelectedAccount(acc);
                                                    setShowAccountDropdown(false);
                                                }}
                                            >
                                                <UserAvatar
                                                    username={acc.name}
                                                    preferredSkin={acc.preferredSkin}
                                                    uuid={acc.uuid}
                                                    className={styles.accountAvatar}
                                                    accountType={acc.type as any}
                                                />
                                                <div className={styles.accountInfo}>
                                                    <div className={styles.accountName}>{acc.name}</div>
                                                    <div className={styles.accountType}>
                                                        {acc.type === 'offline' ? 'Offline' : 
                                                         acc.type === 'whoap' ? 'Whoap Cloud' : 'Microsoft'}
                                                    </div>
                                                </div>
                                                {selectedAccount?.uuid === acc.uuid && <CheckCircle size={16} color="#ff8800" />}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className={styles.accountActions}>
                                <button 
                                    className={styles.actionBtn} 
                                    onClick={() => selectedAccount && removeAccount(selectedAccount.uuid)}
                                >
                                    <LogOut size={16} />
                                    Remove
                                </button>
                                <button 
                                    className={styles.playBtn} 
                                    onClick={playWithAccount} 
                                    disabled={!selectedAccount || isLoggingIn}
                                >
                                    <Play size={16} fill="currentColor" />
                                    Play
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <div className={styles.visualPanel}>
                    <div className={styles.visualContent}>
                        <div className={styles.featureCard}>
                            <div className={styles.featureIcon}>
                                <Sparkles size={32} />
                            </div>
                            <h3>Modern Launcher</h3>
                            <p>Experience Minecraft like never before with our sleek, modern interface</p>
                        </div>
                        <div className={styles.featureCard}>
                            <div className={styles.featureIcon}>
                                <Gamepad2 size={32} />
                            </div>
                            <h3>Cloud Sync</h3>
                            <p>Your profiles, skins, and settings synced across all devices</p>
                        </div>
                    </div>
                    <div className={styles.bgImage} style={{ backgroundImage: `url(${loginBg})` }} />
                </div>
            </div>

            <div className={styles.footer}>
                <span>© 2024 Whoap Launcher</span>
                <div className={styles.footerLinks}>
                    <a href="#">Privacy</a>
                    <a href="#">Terms</a>
                    <a href="#">Support</a>
                </div>
            </div>
        </div>
    );
};
