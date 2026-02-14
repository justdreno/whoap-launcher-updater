/**
 * Performance Profiler
 * 
 * Lightweight utility to measure startup and runtime performance.
 * Logs timing data to console in development mode.
 */

interface PerformanceMark {
    name: string;
    timestamp: number;
    duration?: number;
}

class PerformanceProfiler {
    private static instance: PerformanceProfiler;
    private marks: Map<string, number> = new Map();
    private measurements: PerformanceMark[] = [];
    private startTime: number;
    private isDev: boolean;

    private constructor() {
        this.startTime = performance.now();
        this.isDev = import.meta.env?.DEV || process.env.NODE_ENV === 'development';
    }

    public static getInstance(): PerformanceProfiler {
        if (!PerformanceProfiler.instance) {
            PerformanceProfiler.instance = new PerformanceProfiler();
        }
        return PerformanceProfiler.instance;
    }

    /**
     * Start a named timer
     */
    public start(name: string): void {
        this.marks.set(name, performance.now());
    }

    /**
     * End a named timer and record the duration
     */
    public end(name: string): number {
        const startTime = this.marks.get(name);
        if (!startTime) {
            console.warn(`[Perf] No start mark for "${name}"`);
            return 0;
        }

        const duration = performance.now() - startTime;
        this.measurements.push({
            name,
            timestamp: startTime - this.startTime,
            duration
        });

        if (this.isDev) {
            const color = duration > 100 ? '\x1b[33m' : '\x1b[32m'; // Yellow if slow, green otherwise
            console.log(`${color}[Perf] ${name}: ${duration.toFixed(2)}ms\x1b[0m`);
        }

        this.marks.delete(name);
        return duration;
    }

    /**
     * Mark a single point in time (useful for milestones)
     */
    public mark(name: string): void {
        const elapsed = performance.now() - this.startTime;
        this.measurements.push({
            name,
            timestamp: elapsed
        });

        if (this.isDev) {
            console.log(`\x1b[36m[Perf] Milestone: ${name} @ ${elapsed.toFixed(2)}ms\x1b[0m`);
        }
    }

    /**
     * Get a summary of all measurements
     */
    public getSummary(): { measurements: PerformanceMark[]; totalTime: number } {
        return {
            measurements: [...this.measurements],
            totalTime: performance.now() - this.startTime
        };
    }

    /**
     * Log a formatted summary table
     */
    public logSummary(): void {
        if (!this.isDev) return;

        console.log('\n\x1b[1m📊 Performance Summary\x1b[0m');
        console.log('─'.repeat(50));

        const sorted = [...this.measurements].sort((a, b) => a.timestamp - b.timestamp);

        sorted.forEach(m => {
            if (m.duration) {
                const bar = '█'.repeat(Math.min(Math.floor(m.duration / 10), 30));
                console.log(`${m.name.padEnd(25)} ${m.duration.toFixed(1).padStart(8)}ms ${bar}`);
            } else {
                console.log(`${m.name.padEnd(25)} @ ${m.timestamp.toFixed(1)}ms (milestone)`);
            }
        });

        console.log('─'.repeat(50));
        console.log(`Total elapsed: ${(performance.now() - this.startTime).toFixed(1)}ms\n`);
    }

    /**
     * Reset all measurements
     */
    public reset(): void {
        this.marks.clear();
        this.measurements = [];
        this.startTime = performance.now();
    }
}

// Export singleton instance
export const perf = PerformanceProfiler.getInstance();
