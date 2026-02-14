export const SkinUtils = {
    /**
     * Determines if a skin name refers to a custom local file.
     * Supports both 'file:name.png' and raw 'name.png' (fallback for server sync).
     */
    isCustom(name: string | undefined): boolean {
        if (!name) return false;
        const lower = name.toLowerCase();
        return lower.startsWith('file:') ||
            lower.startsWith('whoap-skin://') ||
            lower.startsWith('whoap-cape://') ||
            (lower.endsWith('.png') && !lower.startsWith('http'));
    },

    /**
     * Extracts the raw filename from a skin name, removing any protocol prefixes.
     */
    getFileName(name: string | undefined): string {
        if (!name) return '';
        return name
            .replace('file:', '')
            .replace('whoap-skin://', '')
            .replace('whoap-cape://', '')
            .split('?')[0] // Remove query params
            .replace(/[\\/]+$/, ''); // Remove trailing slashes
    },

    /**
     * Resolves a skin name to a usable URL.
     * @param name The skin name (username or local filename)
     * @param variant 'face' or 'body'
     * @param cacheBuster Optional timestamp to prevent caching
     */
    getSkinUrl(name: string | undefined, variant: 'face' | 'body' = 'face', cacheBuster?: string | number): string {
        if (!name) return '';

        if (this.isCustom(name)) {
            const fileName = this.getFileName(name);
            const base = `whoap-skin://${fileName}`;
            return cacheBuster ? `${base}?t=${cacheBuster}` : base;
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
            const base = `whoap-cape://${fileName}`;
            return cacheBuster ? `${base}?t=${cacheBuster}` : base;
        }

        return null; // Username capes not supported yet
    },

    /**
     * Formats a skin name for display in the UI.
     */
    getDisplayName(name: string | undefined, fallback?: string): string {
        if (!name) return 'Default';

        if (this.isCustom(name)) {
            const fileName = this.getFileName(name).replace('.png', '');
            // If filename is long (likely a UUID), format it nicely
            if (fileName.length > 12 && fallback) {
                return `${fallback} (${fileName.substring(0, 5)})`;
            }
            return fileName;
        }

        return name;
    }
};
