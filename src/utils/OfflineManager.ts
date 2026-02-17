// Offline Mode Manager - Centralized offline state management

let isOfflineMode = false;
let offlineListeners: ((offline: boolean) => void)[] = [];

export const OfflineManager = {
    // Check if we're in offline mode
    isOffline: () => isOfflineMode,

    // Set offline mode
    setOffline: (offline: boolean) => {
        if (isOfflineMode !== offline) {
            isOfflineMode = offline;
            offlineListeners.forEach(listener => listener(offline));
            console.log(`[OfflineManager] Mode changed: ${offline ? 'OFFLINE' : 'ONLINE'}`);
        }
    },

    // Subscribe to offline mode changes
    subscribe: (listener: (offline: boolean) => void) => {
        offlineListeners.push(listener);
        return () => {
            offlineListeners = offlineListeners.filter(l => l !== listener);
        };
    },

    // Check if user is online (navigator.onLine is not reliable enough)
    checkOnline: async (): Promise<boolean> => {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            await fetch('https://www.google.com/favicon.ico', {
                method: 'HEAD',
                mode: 'no-cors',
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            return true;
        } catch {
            return false;
        }
    },

    // Initialize offline detection
    init: () => {
        // Listen to browser online/offline events
        window.addEventListener('online', () => OfflineManager.setOffline(false));
        window.addEventListener('offline', () => OfflineManager.setOffline(true));
        
        // Initial check
        OfflineManager.checkOnline().then(online => {
            OfflineManager.setOffline(!online);
        });

        // Periodic check every 30 seconds
        setInterval(async () => {
            const online = await OfflineManager.checkOnline();
            OfflineManager.setOffline(!online);
        }, 30000);
    }
};
