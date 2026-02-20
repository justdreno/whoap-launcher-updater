export interface StoredAccount {
    name: string;
    uuid: string;
    token: string;
    refreshToken?: string;
    expiresAt?: number;
    type: 'microsoft' | 'offline' | 'yashin';
    preferredSkin?: string;
    preferredCape?: string;
}

const STORAGE_KEY = 'yashin_accounts';
const ACTIVE_ACCOUNT_KEY = 'yashin_active_account';

export const AccountManager = {
    getAccounts: (): StoredAccount[] => {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error("Failed to parse accounts", e);
            return [];
        }
    },

    addAccount: (account: StoredAccount) => {
        const accounts = AccountManager.getAccounts();
        const index = accounts.findIndex(a => a.uuid === account.uuid);

        if (index !== -1) {
            // Merge existing data (like preferredSkin) with new data
            accounts[index] = { ...accounts[index], ...account };
        } else {
            accounts.push(account);
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
        AccountManager.setActive(account.uuid);
    },

    removeAccount: (uuid: string) => {
        const accounts = AccountManager.getAccounts();
        const filtered = accounts.filter(a => a.uuid !== uuid);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    },

    setActive: (uuid: string) => {
        localStorage.setItem(ACTIVE_ACCOUNT_KEY, uuid);
    },

    getActive: (): StoredAccount | null => {
        const uuid = localStorage.getItem(ACTIVE_ACCOUNT_KEY);
        if (!uuid) return null;
        const accounts = AccountManager.getAccounts();
        return accounts.find(a => a.uuid === uuid) || null;
    },

    updateAccount: (uuid: string, data: Partial<StoredAccount>) => {
        const accounts = AccountManager.getAccounts();
        const index = accounts.findIndex(a => a.uuid === uuid);
        if (index !== -1) {
            accounts[index] = { ...accounts[index], ...data };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
        }
    }
};
