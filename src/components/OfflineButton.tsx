import React from 'react';
import { useOfflineStatus } from '../hooks/useOfflineStatus';

interface OfflineButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    children: React.ReactNode;
    offlineDisabled?: boolean;
    offlineTooltip?: string;
}

export const OfflineButton: React.FC<OfflineButtonProps> = ({
    children,
    offlineDisabled = true,
    offlineTooltip = 'Internet connection required',
    disabled,
    title,
    ...props
}) => {
    const isOffline = useOfflineStatus();
    const isDisabled = disabled || (offlineDisabled && isOffline);

    return (
        <button
            {...props}
            disabled={isDisabled}
            title={isOffline && offlineDisabled ? offlineTooltip : title}
            style={{
                ...props.style,
                opacity: isDisabled ? 0.5 : 1,
                cursor: isDisabled ? 'not-allowed' : 'pointer',
            }}
        >
            {children}
        </button>
    );
};
