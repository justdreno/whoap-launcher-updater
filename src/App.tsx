import { useState, useEffect, lazy, Suspense } from 'react'
import { MainLayout } from './layouts/MainLayout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './context/ToastContext'
import { ConfirmProvider } from './context/ConfirmContext'
import { AnimationProvider } from './context/AnimationContext'
import { supabase } from './lib/supabase';
import { Skeleton } from './components/Skeleton';
import { perf } from './utils/PerformanceProfiler';
import { JavaInstallModal } from './components/JavaInstallModal';
import { Onboarding } from './pages/Onboarding';

// Mark app module load time
perf.mark('App module loaded');

// Eager-load critical path components
import { Home } from './pages/Home';
import { Login } from './pages/Login';

// Lazy-load non-critical pages for faster startup
const Library = lazy(() => import('./pages/Library').then(m => ({ default: m.Library })));
const Screenshots = lazy(() => import('./pages/Screenshots').then(m => ({ default: m.Screenshots })));
const News = lazy(() => import('./pages/News').then(m => ({ default: m.News })));
const Friends = lazy(() => import('./pages/Friends').then(m => ({ default: m.Friends })));
const Admin = lazy(() => import('./pages/Admin').then(m => ({ default: m.Admin })));
const Instances = lazy(() => import('./pages/Instances').then(m => ({ default: m.Instances })));
const Settings = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Profile = lazy(() => import('./pages/Profile').then(m => ({ default: m.Profile })));

// Fallback component for lazy loading
const PageLoader = () => (
    <div style={{ padding: 40 }}>
        <Skeleton width="200px" height="32px" style={{ marginBottom: 16 }} />
        <Skeleton width="100%" height="200px" />
    </div>
);

function App() {
    const [activeTab, setActiveTab] = useState('news');
    const [user, setUser] = useState<any>(null);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [selectedLibraryInstanceId, setSelectedLibraryInstanceId] = useState<string | null>(null);
    
    // Navigation lock during downloads/launches
    const [isNavLocked, setIsNavLocked] = useState(false);
    
    // App initialization state - single source of truth
    const [appState, setAppState] = useState<{
        stage: 'loading' | 'onboarding' | 'auth-check' | 'login' | 'main';
        onboardingPath?: string;
    }>({ stage: 'loading' });

    useEffect(() => {
        const handleStatusChange = () => {
            setIsOnline(navigator.onLine);
        };

        window.addEventListener('online', handleStatusChange);
        window.addEventListener('offline', handleStatusChange);

        return () => {
            window.removeEventListener('online', handleStatusChange);
            window.removeEventListener('offline', handleStatusChange);
        };
    }, []);

    // Sequential initialization: Onboarding check → Auth check
    useEffect(() => {
        const initializeApp = async () => {
            try {
                // Step 1: Check if onboarding is needed
                console.log('[App] Checking onboarding status...');
                const onboardingResult = await window.ipcRenderer.invoke('config:is-first-launch');
                
                if (onboardingResult.isFirstLaunch) {
                    console.log('[App] First launch detected, showing onboarding');
                    setAppState({ stage: 'onboarding', onboardingPath: onboardingResult.defaultPath });
                    return;
                }

                // Step 2: Onboarding complete, check auth
                console.log('[App] Onboarding complete, checking session...');
                setAppState({ stage: 'auth-check' });
                
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Session check timed out")), 3000)
                );
                const sessionPromise = window.ipcRenderer.invoke('auth:get-session');

                const result: any = await Promise.race([sessionPromise, timeoutPromise]);

                if (result && result.success && result.profile) {
                    // Fetch role from database dynamically
                    let role = 'user';
                    if (result.profile.type === 'whoap' && navigator.onLine) {
                        try {
                            const { ProfileService } = await import('./services/ProfileService');
                            const rolePromise = ProfileService.getRole(result.profile.uuid);
                            const timeout = new Promise<string>((_, r) => setTimeout(() => r(new Error('Timeout')), 2000));
                            role = await Promise.race([rolePromise, timeout]) as string;
                        } catch (e) {
                            console.warn("[App] Could not fetch role, defaulting to 'user'");
                        }
                    }

                    // Check local storage for preferredSkin
                    let storedSkin = result.profile.preferredSkin;
                    let storedCape = result.profile.preferredCape;

                    if (!storedSkin || !storedCape) {
                        try {
                            const { AccountManager } = await import('./utils/AccountManager');
                            const activeAccount = AccountManager.getActive();
                            if (activeAccount && activeAccount.uuid === result.profile.uuid) {
                                if (!storedSkin) storedSkin = activeAccount.preferredSkin;
                                if (!storedCape) storedCape = activeAccount.preferredCape;
                            }
                        } catch (e) { /* ignore */ }
                    }

                    setUser({
                        name: result.profile.name,
                        uuid: result.profile.uuid,
                        token: result.profile.token,
                        type: result.profile.type,
                        role: role,
                        preferredSkin: storedSkin,
                        preferredCape: storedCape
                    });

                    // Sync with Supabase if whoap account
                    if (result.profile.type === 'whoap' && result.profile.token && navigator.onLine) {
                        try {
                            const { CloudManager } = await import('./utils/CloudManager');
                            const syncResult = await CloudManager.syncSession(result.profile.token, result.profile.refreshToken);

                            if (syncResult.success && syncResult.session) {
                                const { AccountManager } = await import('./utils/AccountManager');
                                AccountManager.addAccount({
                                    name: result.profile.name,
                                    uuid: syncResult.session.user.id,
                                    token: syncResult.session.access_token,
                                    refreshToken: syncResult.session.refresh_token,
                                    type: 'whoap'
                                });

                                window.ipcRenderer.invoke('auth:update-session', {
                                    token: syncResult.session.access_token,
                                    refreshToken: syncResult.session.refresh_token
                                });

                                setUser((prev: any) => ({
                                    ...prev,
                                    token: syncResult.session.access_token
                                }));
                            }
                        } catch (e) {
                            console.warn("[App] Failed to sync session");
                        }
                    }

                    setAppState({ stage: 'main' });
                } else {
                    // No session, show login
                    setAppState({ stage: 'login' });
                }
            } catch (e) {
                console.error("[App] Initialization failed:", e);
                // On error, show login
                setAppState({ stage: 'login' });
            }
        };

        initializeApp();

        // Listen for auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                if (session) {
                    const { AccountManager } = await import('./utils/AccountManager');

                    setUser((prev: any) => ({
                        ...prev,
                        token: session.access_token,
                        uuid: session.user.id,
                        name: session.user.user_metadata.display_name || prev?.name || 'User'
                    }));

                    AccountManager.addAccount({
                        name: session.user.user_metadata.display_name || 'User',
                        uuid: session.user.id,
                        token: session.access_token,
                        refreshToken: session.refresh_token,
                        type: 'whoap'
                    });

                    window.ipcRenderer.invoke('auth:update-session', {
                        token: session.access_token,
                        refreshToken: session.refresh_token
                    });

                    setAppState({ stage: 'main' });
                }
            } else if (event === 'SIGNED_OUT') {
                setUser(null);
                setAppState({ stage: 'login' });
            }
        });

        return () => {
            subscription.unsubscribe();
        };
    }, []);

    const handleLogout = async () => {
        if (user && user.type === 'whoap') {
            try {
                const { AccountManager } = await import('./utils/AccountManager');
                AccountManager.removeAccount(user.uuid);
            } catch (e) {
                console.error("Failed to remove WHOAP account from storage", e);
            }
        }

        await window.ipcRenderer.invoke('auth:logout');
        await supabase.auth.signOut();
        setUser(null);
        setAppState({ stage: 'login' });
    };

    const handleOnboardingComplete = () => {
        // After onboarding, check auth
        setAppState({ stage: 'auth-check' });
        
        // Re-run initialization to check session
        const checkSession = async () => {
            try {
                const result: any = await window.ipcRenderer.invoke('auth:get-session');
                if (result && result.success && result.profile) {
                    setUser({
                        name: result.profile.name,
                        uuid: result.profile.uuid,
                        token: result.profile.token,
                        type: result.profile.type
                    });
                    setAppState({ stage: 'main' });
                } else {
                    setAppState({ stage: 'login' });
                }
            } catch (e) {
                setAppState({ stage: 'login' });
            }
        };
        checkSession();
    };

    const handleLoginSuccess = (profile: any) => {
        setUser(profile);
        setAppState({ stage: 'main' });
    };

    // Show loading state
    if (appState.stage === 'loading') {
        return <PageLoader />;
    }

    // Show onboarding for first launch
    if (appState.stage === 'onboarding') {
        return (
            <ErrorBoundary>
                <ToastProvider>
                    <Onboarding onComplete={handleOnboardingComplete} />
                </ToastProvider>
            </ErrorBoundary>
        );
    }

    // Show login if no user
    if (appState.stage === 'login' || (!user && appState.stage !== 'auth-check')) {
        return (
            <ErrorBoundary>
                <ToastProvider>
                    <Login onLoginSuccess={handleLoginSuccess} onOfflineLogin={(name) => console.log("Offline login:", name)} />
                </ToastProvider>
            </ErrorBoundary>
        );
    }

    // Show loader while checking auth
    if (appState.stage === 'auth-check') {
        return <PageLoader />;
    }

    // Main app
    return (
        <ErrorBoundary>
            <AnimationProvider>
                <ToastProvider>
                    <ConfirmProvider>
                        <JavaInstallModal />
                        <MainLayout 
                            activeTab={activeTab} 
                            onTabChange={setActiveTab} 
                            user={user} 
                            onLogout={handleLogout}
                            isNavLocked={isNavLocked}
                        >
                            {activeTab === 'home' && <Home 
                                user={user} 
                                setUser={setUser} 
                                onNavigate={(tab, instanceId) => {
                                    if (instanceId) setSelectedLibraryInstanceId(instanceId);
                                    setActiveTab(tab);
                                }}
                                onLockNav={(locked) => {
                                    setIsNavLocked(locked);
                                }}
                            />}
                            <Suspense fallback={<PageLoader />}>
                                {activeTab === 'profiles' && <Instances onNavigate={(tab, instanceId) => {
                                    if (instanceId) setSelectedLibraryInstanceId(instanceId);
                                    setActiveTab(tab);
                                }} />}
                                {activeTab === 'settings' && <Settings />}
                                {activeTab === 'library' && <Library user={user} isOnline={isOnline} preselectedInstanceId={selectedLibraryInstanceId} />}
                                {activeTab === 'screenshots' && <Screenshots user={user} />}
                                {activeTab === 'friends' && <Friends isOnline={isOnline} />}
                                {activeTab === 'news' && <News />}
                                {activeTab === 'admin' && <Admin user={user} />}
                                {activeTab === 'profile' && <Profile user={user} setUser={setUser} />}
                            </Suspense>
                        </MainLayout>
                    </ConfirmProvider>
                </ToastProvider >
            </AnimationProvider>
        </ErrorBoundary >
    );
}

export default App;
