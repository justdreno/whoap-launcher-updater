import Store from 'electron-store';

export interface StoredSession {
    type: 'microsoft' | 'offline' | 'whoap';
    name: string;
    uuid: string;
    token: string;
    refreshToken?: string;
    expiresAt?: number;
    preferredSkin?: string;
    preferredCape?: string;
}

interface StoreSchema {
    session: StoredSession | null;
}

const store = new Store<StoreSchema>({
    name: 'whoap-session',
    encryptionKey: 'whoap-secure-key-2026',
    defaults: {
        session: null
    }
});

export const SessionStore = {
    save: (session: StoredSession) => {
        store.set('session', session);
    },

    get: (): StoredSession | null => {
        return store.get('session');
    },

    clear: () => {
        store.delete('session');
    },

    isValid: (): boolean => {
        const session = store.get('session');
        if (!session) return false;

        if (session.expiresAt && Date.now() > session.expiresAt) {
            return false;
        }

        return true;
    }
};
