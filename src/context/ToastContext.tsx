import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle, Download } from 'lucide-react';
import styles from './Toast.module.css';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'download';

interface Toast {
    id: string;
    message: string;
    type: ToastType;
    submessage?: string;
    progress?: number;
    exiting?: boolean;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType, options?: { persistent?: boolean; submessage?: string; progress?: number }) => string;
    updateToast: (id: string, updates: Partial<Toast>) => void;
    removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const showToast = useCallback((message: string, type: ToastType = 'info', options?: { persistent?: boolean; submessage?: string; progress?: number }) => {
        const id = Math.random().toString(36).substr(2, 9);
        const newToast: Toast = { 
            id, 
            message, 
            type,
            submessage: options?.submessage,
            progress: options?.progress
        };
        setToasts(prev => [...prev, newToast]);

        // Auto remove after 3s if not persistent and not a download
        if (!options?.persistent && type !== 'download') {
            setTimeout(() => {
                dismissToast(id);
            }, 3000);
        }
        return id;
    }, []);

    const updateToast = useCallback((id: string, updates: Partial<Toast>) => {
        setToasts(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
    }, []);

    const dismissToast = useCallback((id: string) => {
        // Mark as exiting first for animation
        setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t));
        
        // Actually remove after animation
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 300);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    const getIcon = (type: ToastType) => {
        switch (type) {
            case 'success': return <CheckCircle size={20} />;
            case 'error': return <AlertCircle size={20} />;
            case 'warning': return <AlertTriangle size={20} />;
            case 'download': return <Download size={20} />;
            default: return <Info size={20} />;
        }
    };

    return (
        <ToastContext.Provider value={{ showToast, updateToast, removeToast }}>
            {children}
            <div className={styles.toastContainer}>
                {toasts.map(toast => (
                    <div 
                        key={toast.id} 
                        className={`${styles.toast} ${styles[toast.type]} ${toast.exiting ? styles.exiting : ''}`}
                    >
                        <div className={styles.icon}>
                            {getIcon(toast.type)}
                        </div>
                        <div className={styles.content}>
                            <div className={styles.message}>{toast.message}</div>
                            {toast.submessage && (
                                <div className={styles.submessage}>{toast.submessage}</div>
                            )}
                            {toast.type === 'download' && toast.progress !== undefined && (
                                <>
                                    <div className={styles.progressBar}>
                                        <div 
                                            className={styles.progressFill} 
                                            style={{ width: `${toast.progress}%` }}
                                        />
                                    </div>
                                    <div className={styles.progressText}>
                                        <span>Downloading...</span>
                                        <span>{Math.round(toast.progress)}%</span>
                                    </div>
                                </>
                            )}
                        </div>
                        <button className={styles.closeBtn} onClick={() => dismissToast(toast.id)}>
                            <X size={14} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};
