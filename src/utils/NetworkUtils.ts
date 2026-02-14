/**
 * Network Utility for checking internet connectivity
 */

export class NetworkUtils {
    private static isOnlineCache: boolean = true;
    private static lastCheck: number = 0;
    private static CHECK_INTERVAL = 5000; // 5 seconds cache

    /**
     * Check if internet connection is available
     * Uses multiple methods for reliability
     */
    static async checkConnection(): Promise<boolean> {
        const now = Date.now();

        // Return cached result if recent check
        if (now - this.lastCheck < this.CHECK_INTERVAL) {
            return this.isOnlineCache;
        }

        try {
            // Method 1: Check navigator.onLine (fast but not always reliable)
            if (!navigator.onLine) {
                this.isOnlineCache = false;
                this.lastCheck = now;
                return false;
            }

            // Method 2: Try to fetch a reliable endpoint
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);

            try {
                await fetch('https://www.google.com/favicon.ico', {
                    method: 'HEAD',
                    mode: 'no-cors',
                    cache: 'no-cache',
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                this.isOnlineCache = true;
            } catch {
                // If Google fails, try Cloudflare
                try {
                    await fetch('https://cloudflare.com/cdn-cgi/trace', {
                        method: 'HEAD',
                        mode: 'no-cors',
                        cache: 'no-cache',
                        signal: controller.signal
                    });
                    clearTimeout(timeoutId);
                    this.isOnlineCache = true;
                } catch {
                    this.isOnlineCache = false;
                }
            }
        } catch (error) {
            console.warn('[NetworkUtils] Connection check failed:', error);
            this.isOnlineCache = false;
        }

        this.lastCheck = now;
        return this.isOnlineCache;
    }

    /**
     * Get current online status from cache (synchronous)
     */
    static isOnline(): boolean {
        return this.isOnlineCache;
    }

    /**
     * Set up event listeners for online/offline events
     */
    static setupListeners(callback: (isOnline: boolean) => void) {
        const handleOnline = async () => {
            // Verify with actual connection check
            const online = await NetworkUtils.checkConnection();
            callback(online);
        };

        const handleOffline = () => {
            NetworkUtils.isOnlineCache = false;
            callback(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Return cleanup function
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }

    /**
     * Force a connection check and update cache
     */
    static async forceCheck(): Promise<boolean> {
        this.lastCheck = 0; // Reset cache
        return await this.checkConnection();
    }
}
