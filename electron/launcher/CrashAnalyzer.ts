export interface CrashAnalysis {
    cause: string;
    details: string;
    suggestion: string;
    isDetected: boolean;
}

export class CrashAnalyzer {
    private static PATTERNS: { regex: RegExp; cause: string; suggestion: string; details?: string }[] = [
        {
            regex: /Mixin transformation of .* failed/,
            cause: 'Mod Incompatibility (Mixin Failure)',
            suggestion: 'A mod is failing to apply its changes to the game code. This usually means a mod is incompatible with this version of Minecraft or another mod. Check the stacktrace for mod names.'
        },
        {
            regex: /java\.lang\.OutOfMemoryError/,
            cause: 'Out of Memory',
            suggestion: 'The game ran out of RAM. Go to Settings and allocate more memory (recommend 4GB+ for modded).'
        },
        {
            regex: /Class file version 6[0-9]\.0/,
            cause: 'Java Version Mismatch',
            suggestion: 'You are using an older Java version to run mods that require a newer one. Try changing the Java Runtime in Settings to Java 17 or 21.'
        },
        {
            regex: /org\.spongepowered\.asm\.mixin\.injection\.throwables\.InvalidInjectionException/,
            cause: 'Mixin Injection Failure',
            suggestion: 'A mod is trying to modify code that doesn\'t exist or has changed. This is common when using mods meant for a different Minecraft version.'
        },
        {
            regex: /VideoCardHelper/,
            cause: 'Graphics Driver Issue',
            suggestion: 'Your graphics drivers may be outdated. Please search for "Intel/Nvidia/AMD Driver Update" and install the latest drivers.'
        }
    ];

    public static analyze(exitCode: number, logLines: string[]): CrashAnalysis {
        const fullLog = logLines.join('\n');

        // 1. Check strict exit codes
        if (exitCode === -1073740791) {
            return {
                cause: 'Graphics Driver Crash (0xC0000409)',
                details: 'Status Stack Buffer Overrun',
                suggestion: 'Update your graphics drivers (Nvidia/Intel/AMD). If using Nvidia, try a "Clean Install".',
                isDetected: true
            };
        }

        // 2. Scan Regex Patterns
        for (const pattern of this.PATTERNS) {
            if (pattern.regex.test(fullLog)) {

                // Specific Logic for mod names in Mixin errors
                let extraDet = '';
                if (pattern.cause.includes('Mixin')) {
                    // Try to find "from mod X"
                    const modMatch = fullLog.match(/from mod ([a-zA-Z0-9_-]+)/);
                    if (modMatch) {
                        extraDet = `Likely caused by mod: "${modMatch[1]}"`;
                    }
                }

                return {
                    cause: pattern.cause,
                    details: extraDet || pattern.details || 'Detected identifying error pattern in logs.',
                    suggestion: pattern.suggestion,
                    isDetected: true
                };
            }
        }

        // 3. Fallback
        return {
            cause: 'Unknown Crash',
            details: `Exit Code: ${exitCode}`,
            suggestion: 'We couldn\'t automatically identify the cause. Please check the raw logs or report this to the modpack author.',
            isDetected: false
        };
    }
}
