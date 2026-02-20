export const SkinUtils = {
    /**
     * Determines if a skin name refers to a custom local file.
     * Supports both 'file:name.png' and raw 'name.png' (fallback for server sync).
     */
    isCustom(name: string | undefined): boolean {
        if (!name) return false;
        const lower = name.toLowerCase();
        return lower.startsWith('file:') ||
            lower.startsWith('yashin-skin://') ||
            lower.startsWith('yashin-cape://') ||
            (lower.endsWith('.png') && !lower.startsWith('http'));
    },

    /**
     * Extracts the raw filename from a skin name, removing any protocol prefixes.
     */
    getFileName(name: string | undefined): string {
        if (!name) return '';
        return name
            .replace('file:', '')
            .replace('yashin-skin://', '')
            .replace('yashin-cape://', '')
            .split('?')[0] // Remove query params
            .replace(/[\\/]+$/, ''); // Remove trailing slashes
    },

    /**
     * Checks if browser is offline
     */
    isOffline(): boolean {
        return typeof navigator !== 'undefined' && !navigator.onLine;
    },

    /**
     * Resolves a skin name to a usable URL.
     * @param name The skin name (username or local filename)
     * @param variant 'face' or 'body'
     * @param cacheBuster Optional timestamp to prevent caching
     * @param preferCache Whether to use cached version when available
     */
    getSkinUrl(name: string | undefined, variant: 'face' | 'body' = 'face', cacheBuster?: string | number, preferCache: boolean = true): string {
        if (!name) return this.getDefaultSkinUrl(variant);

        // If it's already a full URL (e.g., from Supabase), return it directly
        if (name.startsWith('http://') || name.startsWith('https://')) {
            return cacheBuster ? `${name}${name.includes('?') ? '&' : '?'}t=${cacheBuster}` : name;
        }

        if (this.isCustom(name)) {
            const fileName = this.getFileName(name);
            const base = `yashin-skin://${fileName}`;
            return cacheBuster ? `${base}?t=${cacheBuster}` : base;
        }

        // For username-based skins
        const isOffline = this.isOffline();

        if (isOffline && preferCache) {
            // When offline, try to use cached version via IPC
            // Return a placeholder that will be resolved by the protocol handler
            const type = variant === 'body' ? 'skin' : 'avatar';
            return `yashin-skin://cached/${name}/${type}`;
        }

        // Default to mc-heads.net for usernames
        return variant === 'body'
            ? `https://mc-heads.net/skin/${name}`
            : `https://mc-heads.net/avatar/${name}`;
    },

    /**
     * Resolves a cape name to a usable URL.
     */
    getCapeUrl(name: string | undefined, cacheBuster?: string | number): string | null {
        if (!name) return null;

        if (this.isCustom(name)) {
            const fileName = this.getFileName(name);
            const base = `yashin-cape://${fileName}`;
            return cacheBuster ? `${base}?t=${cacheBuster}` : base;
        }

        return null; // Username capes not supported yet
    },

    /**
     * Gets the default skin URL for fallback when offline and no cache
     */
    getDefaultSkinUrl(variant: 'face' | 'body' = 'face'): string {
        // Use Steve as default
        return variant === 'body'
            ? '/assets/skins/steve.png'
            : '/assets/skins/steve_face.png';
    },

    /**
     * Formats a skin name for display in the UI.
     */
    getDisplayName(name: string | undefined, fallback?: string): string {
        if (!name) return 'Default';

        // If it's a direct URL (cloud uploaded skin), return fallback or generic name
        if (name.startsWith('http://') || name.startsWith('https://')) {
            return fallback && fallback !== 'Steve' ? fallback : 'My Skin';
        }

        if (this.isCustom(name)) {
            const fileName = this.getFileName(name).replace('.png', '');

            // Check if it's a skin_ prefix with timestamp (our auto-generated files)
            if (fileName.startsWith('skin_') && fileName.length > 10) {
                // Return just the user's name if available
                if (fallback && fallback !== 'Steve') {
                    return fallback;
                }
                // Otherwise show "Custom Skin"
                return 'Custom Skin';
            }

            // Check if it's a cape_ prefix
            if (fileName.startsWith('cape_') && fileName.length > 10) {
                return 'Custom Cape';
            }

            // If filename is long (likely a UUID), format it nicely
            if (fileName.length > 12 && fallback) {
                return `${fallback} (${fileName.substring(0, 5)})`;
            }
            return fileName;
        }

        return name;
    },

    /**
     * Preloads a skin into the cache (when online)
     */
    async preloadSkin(username: string, type: 'skin' | 'avatar' = 'avatar'): Promise<void> {
        if (this.isOffline()) return;

        try {
            // Trigger cache via IPC
            await window.ipcRenderer.invoke('skin:cache', username, type);
        } catch (e) {
            console.warn('[SkinUtils] Failed to preload skin:', e);
        }
    }
};
