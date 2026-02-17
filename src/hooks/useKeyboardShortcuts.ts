import { useEffect, useCallback } from 'react';

export interface KeyboardShortcut {
    key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    action: () => void;
    description: string;
}

export const useKeyboardShortcuts = (shortcuts: KeyboardShortcut[]) => {
    const handleKeyDown = useCallback((event: KeyboardEvent) => {
        // Don't trigger shortcuts when typing in input fields
        if (event.target instanceof HTMLInputElement || 
            event.target instanceof HTMLTextAreaElement ||
            (event.target as HTMLElement).isContentEditable) {
            return;
        }

        for (const shortcut of shortcuts) {
            const ctrlMatch = !!shortcut.ctrl === (event.ctrlKey || event.metaKey);
            const altMatch = !!shortcut.alt === event.altKey;
            const shiftMatch = !!shortcut.shift === event.shiftKey;
            const keyMatch = event.key.toLowerCase() === shortcut.key.toLowerCase();

            if (ctrlMatch && altMatch && shiftMatch && keyMatch) {
                event.preventDefault();
                shortcut.action();
                break;
            }
        }
    }, [shortcuts]);

    useEffect(() => {
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleKeyDown]);
};

// Predefined shortcuts
export const createInstanceShortcuts = (actions: {
    onNewInstance: () => void;
    onRefresh: () => void;
    onImport?: () => void;
    onSearch?: () => void;
}): KeyboardShortcut[] => [
    {
        key: 'n',
        ctrl: true,
        action: actions.onNewInstance,
        description: 'Create new instance (Ctrl+N)'
    },
    {
        key: 'r',
        ctrl: true,
        action: actions.onRefresh,
        description: 'Refresh instances list (Ctrl+R)'
    },
    {
        key: 'i',
        ctrl: true,
        action: actions.onImport || (() => {}),
        description: 'Import instance (Ctrl+I)'
    },
    {
        key: 'f',
        ctrl: true,
        action: actions.onSearch || (() => {}),
        description: 'Search instances (Ctrl+F)'
    }
];
