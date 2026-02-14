import { ipcMain } from 'electron';
import * as util from 'minecraft-server-util';

export class NetworkManager {
    constructor() {
        this.init();
    }

    private init() {
        ipcMain.handle('network:get-server-status', async (_, address: string) => {
            try {
                // IP සහ Port එක වෙන් කරගැනීම (Ex: play.hypixel.net:25565)
                const parts = address.split(':');
                const ip = parts[0];
                const port = parts[1] ? parseInt(parts[1]) : 25565;

                // කෙලින්ම Server එකට Ping කිරීම (Timeout: 5 seconds)
                const result = await util.status(ip, port, { timeout: 5000 });

                return {
                    online: true,
                    players: {
                        online: result.players.online,
                        max: result.players.max
                    },
                    version: result.version.name,
                    // MOTD එක පිරිසිදු කරලා ගැනීම
                    motd: result.motd.clean,
                    // Icon එක Base64 විදියට එන නිසා කෙලින්ම පාවිච්චි කළ හැක
                    icon: result.favicon
                };

            } catch (e) {
                console.error(`[NetworkManager] Ping failed for ${address}:`, e);
                // සර්වර් එක ඕෆ්ලයින් නම් හෝ වැරදි නම්
                return {
                    online: false,
                    players: { online: 0, max: 0 },
                    motd: 'Offline or Unreachable',
                    icon: null
                };
            }
        });
    }
}