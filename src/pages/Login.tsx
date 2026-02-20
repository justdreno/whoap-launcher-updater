import React, { useState, useEffect, useRef } from 'react';
import styles from './Login.module.css';
import { AccountManager, StoredAccount } from '../utils/AccountManager';
import { LogOut, ChevronDown, Play, ChevronUp, CheckCircle, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import loginBg from '../assets/login_bg.png';
import { UserAvatar } from '../components/UserAvatar';

interface LoginProps {
    onLoginSuccess: (profile: any) => void;
    onOfflineLogin: (username: string) => void;
}

type AuthMode = 'whoap' | 'microsoft' | 'offline';

export const Login: React.FC<LoginProps> = ({ onLoginSuccess, onOfflineLogin }) => {
    const [authMode, setAuthMode] = useState<AuthMode>('microsoft');
    const [isLoggingIn, setIsLoggingIn] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [accounts, setAccounts] = useState<StoredAccount[]>([]);
    const [selectedAccount, setSelectedAccount] = useState<StoredAccount | null>(null);
    const [showAccountDropdown, setShowAccountDropdown] = useState(false);

    // Whoap Auth State
    const [isRegistering, setIsRegistering] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [username, setUsername] = useState('');
    const [verificationSent, setVerificationSent] = useState(false);
    
    const [isCheckingPremium, setIsCheckingPremium] = useState(false);
    const [isPremiumUsername, setIsPremiumUsername] = useState(false);
    const [showPremiumWarning, setShowPremiumWarning] = useState(false);
    const premiumCheckTimeout = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const stored = AccountManager.getAccounts();
        setAccounts(stored);
        const active = AccountManager.getActive();
        if (active) setSelectedAccount(active);
        else if (stored.length > 0) setSelectedAccount(stored[0]);
    }, []);

    const checkPremiumUsername = async (name: string): Promise<boolean> => {
        if (!name || name.length < 3) return false;
        try {
            const response = await fetch(`https://api.ashcon.app/mojang/v2/user/${encodeURIComponent(name)}`);
            if (response.ok) {
                const data = await response.json();
                return !!data.uuid;
            }
        } catch {
            try {
                const mojangResponse = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
                if (mojangResponse.ok) {
                    return true;
                }
            } catch {
                return false;
            }
        }
        return false;
    };

    useEffect(() => {
        if (!isRegistering || !username.trim()) {
            setIsPremiumUsername(false);
            setShowPremiumWarning(false);
            setIsCheckingPremium(false);
            return;
        }

        if (premiumCheckTimeout.current) {
            clearTimeout(premiumCheckTimeout.current);
        }

        setIsCheckingPremium(true);
        setIsPremiumUsername(false);
        setShowPremiumWarning(false);

        premiumCheckTimeout.current = setTimeout(async () => {
            const isPremium = await checkPremiumUsername(username.trim());
            setIsPremiumUsername(isPremium);
            if (isPremium) {
                setShowPremiumWarning(true);
            }
            setIsCheckingPremium(false);
        }, 500);

        return () => {
            if (premiumCheckTimeout.current) {
                clearTimeout(premiumCheckTimeout.current);
            }
        };
    }, [username, isRegistering]);

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
        onLoginSuccess({ ...profile, type });
    };

    const handleMicrosoftLogin = async () => {
        setIsLoggingIn(true);
        setError(null);
        try {
            const result = await window.ipcRenderer.invoke('auth:login-microsoft');
            if (result.success) {
                handleSuccess(result.profile, 'microsoft');
            } else {
                setError("Login failed: " + result.error);
            }
        } catch (err) {
            setError("An unexpected error occurred.");
            console.error(err);
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleOfflineLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return;

        setIsLoggingIn(true);
        try {
            const result = await window.ipcRenderer.invoke('auth:login-offline', username);
            if (result.success) {
                onOfflineLogin(result.profile.name);
                handleSuccess(result.profile, 'offline');
            }
        } catch (err) {
            setError("Offline login failed.");
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleWhoapAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoggingIn(true);
        setError(null);

        try {
            if (isRegistering) {
                if (!username) {
                    throw new Error("Username is required");
                }

                // Check availability
                const { CloudManager } = await import('../utils/CloudManager');
                const isTaken = await CloudManager.checkUsernameExists(username);
                if (isTaken) {
                    throw new Error("Username is already taken. Please choose another.");
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
                        throw new Error("Please verify your email before logging in.");
                    }
                    throw error;
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
            setError(err.message || "Authentication failed");
        } finally {
            setIsLoggingIn(false);
        }
    };

    const handleAccountSelect = async (account: StoredAccount) => {
        setIsLoggingIn(true);
        try {
            AccountManager.setActive(account.uuid);

            // Save session to electron-store for persistence across app restarts
            await window.ipcRenderer.invoke('auth:set-session', {
                type: account.type,
                name: account.name,
                uuid: account.uuid,
                token: account.token,
                refreshToken: account.refreshToken,
                expiresAt: account.expiresAt,
                preferredSkin: account.preferredSkin
            });

            // Sync Supabase session if it's a whoap account (only when online)
            if (account.type === 'whoap' && account.token && navigator.onLine) {
                try {
                    const { CloudManager } = await import('../utils/CloudManager');
                    const syncResult = await CloudManager.syncSession(account.token, account.refreshToken);

                    // If session was refreshed, update stored tokens
                    if (syncResult.success && syncResult.session) {
                        const updatedAccount: StoredAccount = {
                            ...account,
                            token: syncResult.session.access_token,
                            refreshToken: syncResult.session.refresh_token
                        };
                        AccountManager.addAccount(updatedAccount);

                        // Update main process session store
                        await window.ipcRenderer.invoke('auth:update-session', {
                            token: syncResult.session.access_token,
                            refreshToken: syncResult.session.refresh_token
                        });

                        // Use refreshed tokens for login success - AFTER session is ready
                        onLoginSuccess({
                            name: account.name,
                            uuid: account.uuid,
                            token: syncResult.session.access_token,
                            type: account.type,
                            preferredSkin: account.preferredSkin
                        });
                        setIsLoggingIn(false);
                        return; // Exit early since we already called onLoginSuccess
                    } else if (!syncResult.success) {
                        console.warn("[Login] Session sync failed, account may have limited functionality");
                    }
                } catch (e) {
                    console.warn("[Login] Session sync error:", e);
                }
            }

            // Only reach here if: 
            // - Not a whoap account
            // - Offline mode
            // - Session sync failed but we still want to proceed
            onLoginSuccess({
                name: account.name,
                uuid: account.uuid,
                token: account.token,
                type: account.type,
                preferredSkin: account.preferredSkin
            });
        } catch (err) {
            console.error("Account selection failed", err);
            setError("Failed to switch account.");
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

    return (
        <div className={styles.container}>
            {/* Left Sidebar */}
            <div className={styles.sidebar}>
                <div className={styles.logoArea}>
                    <h1 className={styles.logoTitle}>
                        <span className={styles.logoBold}>Whoap</span>
                        <span className={styles.logoLight}>Launcher</span>
                    </h1>
                </div>

                <div className={styles.authTabs}>
                    <button
                        className={`${styles.authTab} ${authMode === 'microsoft' ? styles.active : ''}`}
                        onClick={() => setAuthMode('microsoft')}
                    >
                        Microsoft
                    </button>
                    <button
                        className={`${styles.authTab} ${authMode === 'whoap' ? styles.active : ''}`}
                        onClick={() => setAuthMode('whoap')}
                    >
                        Whoap
                    </button>
                    <button
                        className={`${styles.authTab} ${authMode === 'offline' ? styles.active : ''}`}
                        onClick={() => setAuthMode('offline')}
                    >
                        Offline
                    </button>
                </div>

                {authMode === 'microsoft' && (
                    <div className={styles.authForm}>
                        <button
                            className={styles.microsoftBtn}
                            onClick={handleMicrosoftLogin}
                            disabled={isLoggingIn}
                        >
                            <svg viewBox="0 0 21 21" width="20" height="20">
                                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                            </svg>
                            {isLoggingIn ? 'Connecting...' : 'Login with Microsoft'}
                        </button>
                        <p style={{ color: '#666', fontSize: 13, textAlign: 'center', marginTop: 12 }}>
                            Sign in with your Microsoft account to play Minecraft: Java Edition.
                        </p>
                    </div>
                )}

                {authMode === 'whoap' && (
                    <form onSubmit={handleWhoapAuth} className={styles.authForm}>
                        {verificationSent ? (
                            <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                <div style={{ fontSize: 48, marginBottom: 16 }}>✉️</div>
                                <h3 style={{ marginBottom: 8 }}>Check your inbox</h3>
                                <p style={{ color: '#888', fontSize: 14, marginBottom: 24 }}>
                                    We sent a verification link to <strong style={{ color: '#fff' }}>{email}</strong>
                                </p>
                                <button
                                    type="button"
                                    className={styles.primaryBtn}
                                    onClick={() => { setVerificationSent(false); setIsRegistering(false); }}
                                >
                                    Return to Login
                                </button>
                            </div>
                        ) : (
                            <>
                                {isRegistering && (
                                    <div className={styles.inputGroup}>
                                        <label className={styles.label}>Display Name</label>
                                        <input
                                            className={`${styles.input} ${isPremiumUsername ? styles.inputWarning : ''}`}
                                            type="text"
                                            value={username}
                                            onChange={e => setUsername(e.target.value)}
                                            placeholder="Username"
                                            required
                                        />
                                        {isCheckingPremium && (
                                            <span className={styles.checkingText}>Checking username...</span>
                                        )}
                                        {showPremiumWarning && isPremiumUsername && (
                                            <div className={styles.premiumWarning}>
                                                <div className={styles.premiumWarningHeader}>
                                                    <AlertTriangle size={16} />
                                                    <span>Premium Username Detected</span>
                                                </div>
                                                <p className={styles.premiumWarningText}>
                                                    "<strong>{username}</strong>" belongs to a premium Minecraft account.
                                                </p>
                                                <p className={styles.premiumWarningSubtext}>
                                                    To use this name, please verify ownership by logging in with Microsoft.
                                                </p>
                                                <div className={styles.premiumWarningActions}>
                                                    <button
                                                        type="button"
                                                        className={styles.microsoftSmallBtn}
                                                        onClick={() => setAuthMode('microsoft')}
                                                    >
                                                        <svg viewBox="0 0 21 21" width="14" height="14">
                                                            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                                                            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                                                            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                                                            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                                                        </svg>
                                                        Login with Microsoft
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className={styles.offlineSmallBtn}
                                                        onClick={() => setAuthMode('offline')}
                                                    >
                                                        Use Offline Mode
                                                    </button>
                                                </div>
                                                <button
                                                    type="button"
                                                    className={styles.dismissBtn}
                                                    onClick={() => setShowPremiumWarning(false)}
                                                >
                                                    Choose a different name
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Email</label>
                                    <input
                                        className={styles.input}
                                        type="email"
                                        value={email}
                                        onChange={e => setEmail(e.target.value)}
                                        placeholder="name@example.com"
                                        required
                                    />
                                </div>
                                <div className={styles.inputGroup}>
                                    <label className={styles.label}>Password</label>
                                    <input
                                        className={styles.input}
                                        type="password"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        placeholder="••••••••"
                                        required
                                    />
                                </div>
                                <button type="submit" className={styles.primaryBtn} disabled={isLoggingIn || isCheckingPremium || (isRegistering && showPremiumWarning)}>
                                    {isLoggingIn ? 'Processing...' : isCheckingPremium ? 'Checking username...' : (isRegistering ? 'Create Account' : 'Sign In')}
                                </button>

                                <div className={styles.toggleMeta}>
                                    {isRegistering ? 'Already have an account?' : "Don't have an account?"}
                                    <button type="button" className={styles.linkBtn} onClick={() => setIsRegistering(!isRegistering)}>
                                        {isRegistering ? 'Log In' : 'Sign Up'}
                                    </button>
                                </div>
                            </>
                        )}
                    </form>
                )}

                {authMode === 'offline' && (
                    <form onSubmit={handleOfflineLogin} className={styles.authForm}>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Username</label>
                            <input
                                type="text"
                                placeholder="Steve"
                                className={styles.input}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                disabled={isLoggingIn}
                                required
                            />
                        </div>
                        <button type="submit" className={styles.primaryBtn} disabled={!username || isLoggingIn}>
                            {isLoggingIn ? 'Creating...' : 'Play Offline'}
                        </button>
                        <p style={{ color: '#666', fontSize: 13, textAlign: 'center' }}>
                            Offline profiles are local only. Skins and online servers won't work.
                        </p>
                    </form>
                )}

                {error && <div className={styles.error}>{error}</div>}

                {accounts.length > 0 && (
                    <div className={styles.accountSection}>
                        <div className={styles.divider}>Logged In Users</div>
                        <div style={{ position: 'relative' }}>
                            <div className={styles.accountDropdown} onClick={() => setShowAccountDropdown(!showAccountDropdown)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                    {selectedAccount && (
                                        <UserAvatar
                                            username={selectedAccount.name}
                                            preferredSkin={selectedAccount.preferredSkin}
                                            uuid={selectedAccount.uuid}
                                            className={styles.miniAvatar}
                                            accountType={selectedAccount.type as any}
                                        />
                                    )}
                                    <div>
                                        <div style={{ fontWeight: 600, fontSize: 14 }}>{selectedAccount?.name || 'Select Account'}</div>
                                        <div style={{ fontSize: 11, color: '#666' }}>
                                            {selectedAccount?.type === 'offline' ? 'Offline' : (selectedAccount?.type === 'whoap' ? 'Whoap Cloud' : 'Microsoft')}
                                        </div>
                                    </div>
                                </div>
                                {showAccountDropdown ? <ChevronUp size={16} color="#666" /> : <ChevronDown size={16} color="#666" />}
                            </div>

                            {showAccountDropdown && (
                                <div className={styles.dropdownMenu}>
                                    {accounts.map(acc => (
                                        <div
                                            key={acc.uuid}
                                            className={styles.dropdownItem}
                                            onClick={() => {
                                                setSelectedAccount(acc);
                                                setShowAccountDropdown(false);
                                                // Automatically trigger play with this account
                                                handleAccountSelect(acc);
                                            }}
                                        >
                                            <UserAvatar
                                                username={acc.name}
                                                preferredSkin={acc.preferredSkin}
                                                uuid={acc.uuid}
                                                className={styles.miniAvatar}
                                                accountType={acc.type as any}
                                            />
                                            <div style={{ flex: 1 }}>
                                                <div style={{ fontSize: 13, fontWeight: 500 }}>{acc.name}</div>
                                                <div style={{ fontSize: 11, color: '#666' }}>
                                                    {acc.type === 'offline' ? 'Offline' : (acc.type === 'whoap' ? 'Whoap Cloud' : 'Microsoft')}
                                                </div>
                                            </div>
                                            {selectedAccount?.uuid === acc.uuid && <CheckCircle size={14} color="#fff" />}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className={styles.accountActions}>
                            <button className={`${styles.actionBtn} ${styles.logoutBtn}`} onClick={() => selectedAccount && removeAccount(selectedAccount.uuid)}>
                                <LogOut size={16} /> Log Out
                            </button>
                            <button className={`${styles.actionBtn} ${styles.playBtn}`} onClick={playWithAccount} disabled={!selectedAccount}>
                                <Play size={16} fill="#fff" /> Play
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Panel - Background */}
            <div className={styles.bgPanel} style={{ backgroundImage: `url(${loginBg})` }} />
        </div >
    );
};
