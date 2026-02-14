import fs from 'fs';
import path from 'path';

export interface VersionInfo {
    id: string;
    name: string;
    mcVersion: string;
    loader: 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt';
}

export class VersionUtils {
    /**
     * Extracts version information from a version JSON file.
     */
    static getInfo(jsonPath: string, folderId: string): VersionInfo {
        try {
            const content = fs.readFileSync(jsonPath, 'utf-8');
            const data = JSON.parse(content);

            const mcVersion = this.extractMCVersion(data, folderId);
            const loader = this.detectLoader(data, folderId);
            const name = this.generatePrettyName(folderId, mcVersion, loader);

            return {
                id: folderId,
                name: name,
                mcVersion: mcVersion,
                loader: loader
            };
        } catch (e) {
            console.error(`[VersionUtils] Failed to parse version JSON at ${jsonPath}:`, e);
            return {
                id: folderId,
                name: folderId,
                mcVersion: folderId,
                loader: 'vanilla'
            };
        }
    }

    private static extractMCVersion(data: any, folderId: string): string {
        // 1. inheritsFrom is most reliable for modded loaders
        if (data.inheritsFrom && data.inheritsFrom.match(/^\d+\.\d+(\.\d+)?$/)) {
            return data.inheritsFrom;
        }

        // 2. jar property
        if (data.jar && data.jar.match(/^\d+\.\d+(\.\d+)?$/)) {
            return data.jar;
        }

        // 3. Client download URL
        if (data.downloads?.client?.url) {
            const match = data.downloads.client.url.match(/\/versions\/(1\.\d+(\.\d+)?)\//);
            if (match) return match[1];
        }

        // 4. Fallback to folder name regex
        const folderMatch = folderId.match(/\b1\.\d+(\.\d+)?\b/);
        if (folderMatch) return folderMatch[0];

        return folderId;
    }

    private static detectLoader(data: any, id: string): 'vanilla' | 'fabric' | 'forge' | 'neoforge' | 'quilt' {
        const idLower = id.toLowerCase();

        // Hytale/Name heuristics
        if (idLower.includes('neoforge')) return 'neoforge';
        if (idLower.includes('forge')) return 'forge';
        if (idLower.includes('fabric')) return 'fabric';
        if (idLower.includes('quilt')) return 'quilt';

        // Main class check
        const mainClass = data.mainClass || '';
        if (mainClass.includes('fabric')) return 'fabric';
        if (mainClass.includes('forge') || mainClass.includes('cpw.mods')) return 'forge';
        if (mainClass.includes('quilt')) return 'quilt';

        // Libraries check
        if (data.libraries && Array.isArray(data.libraries)) {
            const libs = data.libraries.map((l: any) => l.name || '');
            if (libs.some((n: string) => n.includes('net.fabricmc:fabric-loader'))) return 'fabric';
            if (libs.some((n: string) => n.includes('net.neoforged'))) return 'neoforge';
            if (libs.some((n: string) => n.includes('minecraftforge'))) return 'forge';
            if (libs.some((n: string) => n.includes('org.quiltmc'))) return 'quilt';
        }

        return 'vanilla';
    }

    private static generatePrettyName(id: string, mcVersion: string, loader: string): string {
        // If it's just the version, return it
        if (id === mcVersion) return mcVersion;

        // If it's a typical TLauncher name like "1.20.1-Fabric", keep it but clean it
        if (id.toLowerCase().includes(mcVersion.toLowerCase())) {
            let clean = id.replace(/_/g, ' ');
            // Ensure first letter of loader is capitalized in name for beauty
            if (loader !== 'vanilla') {
                const loaderPretty = loader.charAt(0).toUpperCase() + loader.slice(1);
                if (!clean.includes(loaderPretty)) {
                    clean = `${mcVersion} (${loaderPretty})`;
                }
            }
            return clean;
        }

        // Default to a structured name
        const loaderPretty = loader !== 'vanilla' ? ` (${loader.charAt(0).toUpperCase() + loader.slice(1)})` : '';
        return `${mcVersion}${loaderPretty}`;
    }
}
