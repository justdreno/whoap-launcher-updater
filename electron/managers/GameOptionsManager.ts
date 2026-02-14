import path from 'path';
import fs from 'fs/promises';
import { existsSync } from 'fs';

export class GameOptionsManager {
    static async readOptions(instancePath: string): Promise<Record<string, string>> {
        const optionsPath = path.join(instancePath, 'options.txt');
        if (!existsSync(optionsPath)) {
            return {};
        }

        const content = await fs.readFile(optionsPath, 'utf-8');
        const options: Record<string, string> = {};

        content.split('\n').forEach(line => {
            const [key, value] = line.split(':');
            if (key && value) {
                options[key.trim()] = value.trim();
            }
        });

        return options;
    }

    static async saveOptions(instancePath: string, options: Record<string, string>) {
        const optionsPath = path.join(instancePath, 'options.txt');

        // Read existing to preserve unknown keys
        const existing = await this.readOptions(instancePath);
        const merged = { ...existing, ...options };

        const content = Object.entries(merged)
            .map(([key, value]) => `${key}:${value}`)
            .join('\n');

        await fs.writeFile(optionsPath, content);
    }

    static async setRenderDistance(instancePath: string, chunkRadius: number) {
        await this.saveOptions(instancePath, { renderDistance: chunkRadius.toString() });
    }

    static async setFullscreen(instancePath: string, fullscreen: boolean) {
        await this.saveOptions(instancePath, { fullscreen: fullscreen.toString() });
    }
}
