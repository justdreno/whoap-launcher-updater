import { useState, useEffect } from 'react';
import { OfflineManager } from '../utils/OfflineManager';

export const useOfflineStatus = () => {
    const [isOffline, setIsOffline] = useState(OfflineManager.isOffline());

    useEffect(() => {
        const unsubscribe = OfflineManager.subscribe((offline) => {
            setIsOffline(offline);
        });

        return () => unsubscribe();
    }, []);

    return isOffline;
};
