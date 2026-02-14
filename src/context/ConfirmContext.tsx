import React, { createContext, useContext, useState, useCallback } from 'react';
import { ConfirmModal } from '../components/ConfirmModal';

interface ConfirmOptions {
    confirmLabel?: string;
    cancelLabel?: string;
    isDanger?: boolean;
    inputConfig?: {
        type?: 'text' | 'textarea';
        placeholder?: string;
        defaultValue?: string;
    };
}

interface ConfirmContextType {
    confirm: (title: string, message: string, options?: ConfirmOptions) => Promise<boolean>;
    prompt: (title: string, message: string, options?: ConfirmOptions) => Promise<string | null>;
}

const ConfirmContext = createContext<ConfirmContextType | undefined>(undefined);

export const useConfirm = () => {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('useConfirm must be used within a ConfirmProvider');
    }
    return context.confirm;
};

export const usePrompt = () => {
    const context = useContext(ConfirmContext);
    if (!context) {
        throw new Error('usePrompt must be used within a ConfirmProvider');
    }
    return context.prompt;
};

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, setState] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        options: ConfirmOptions;
        resolve: ((value: any) => void) | null;
    }>({
        isOpen: false,
        title: '',
        message: '',
        options: {},
        resolve: null
    });

    const confirm = useCallback((title: string, message: string, options: ConfirmOptions = {}) => {
        return new Promise<boolean>((resolve) => {
            setState({
                isOpen: true,
                title,
                message,
                options,
                resolve
            });
        });
    }, []);

    const prompt = useCallback((title: string, message: string, options: ConfirmOptions = {}) => {
        return new Promise<string | null>((resolve) => {
            setState({
                isOpen: true,
                title,
                message,
                options: { ...options, inputConfig: options.inputConfig || { type: 'text' } },
                resolve
            });
        });
    }, []);

    const handleConfirm = (value?: string) => {
        if (state.resolve) state.resolve(state.options.inputConfig ? (value || '') : true);
        setState(prev => ({ ...prev, isOpen: false }));
    };

    const handleCancel = () => {
        if (state.resolve) state.resolve(state.options.inputConfig ? null : false);
        setState(prev => ({ ...prev, isOpen: false }));
    };

    return (
        <ConfirmContext.Provider value={{ confirm, prompt }}>
            {children}
            <ConfirmModal
                isOpen={state.isOpen}
                title={state.title}
                message={state.message}
                confirmLabel={state.options.confirmLabel}
                cancelLabel={state.options.cancelLabel}
                isDanger={state.options.isDanger}
                inputConfig={state.options.inputConfig}
                onConfirm={handleConfirm}
                onCancel={handleCancel}
            />
        </ConfirmContext.Provider>
    );
};
