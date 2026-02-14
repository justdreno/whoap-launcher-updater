import React, { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import styles from './ConfirmModal.module.css';

interface ConfirmModalProps {
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDanger?: boolean;
    inputConfig?: {
        type?: 'text' | 'textarea';
        placeholder?: string;
        defaultValue?: string;
    };
    onConfirm: (value?: string) => void;
    onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
    isOpen, title, message, confirmLabel = "Confirm", cancelLabel = "Cancel", isDanger = false, inputConfig, onConfirm, onCancel
}) => {
    const [renderObj, setRender] = useState(false);
    const [inputValue, setInputValue] = useState('');

    useEffect(() => {
        if (isOpen) {
            setRender(true);
            setInputValue(inputConfig?.defaultValue || '');
        } else {
            setTimeout(() => setRender(false), 200);
        }
    }, [isOpen, inputConfig]);

    if (!renderObj && !isOpen) return null;

    return (
        <div className={`${styles.overlay} ${isOpen ? styles.open : ''}`}>
            <div className={styles.modal} onClick={e => e.stopPropagation()}>
                <div className={styles.header}>
                    <div className={`${styles.iconArea} ${isDanger ? styles.danger : ''}`}>
                        <AlertTriangle size={20} />
                    </div>
                    <div className={styles.title}>{title}</div>
                    <button className={styles.closeBtn} onClick={onCancel}>
                        <X size={18} />
                    </button>
                </div>

                <div className={styles.body}>
                    {message}
                    {inputConfig && (
                        inputConfig.type === 'textarea' ? (
                            <textarea
                                className={`${styles.input} ${styles.textarea}`}
                                placeholder={inputConfig.placeholder}
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                autoFocus
                            />
                        ) : (
                            <input
                                type="text"
                                className={styles.input}
                                placeholder={inputConfig.placeholder}
                                value={inputValue}
                                onChange={e => setInputValue(e.target.value)}
                                autoFocus
                            />
                        )
                    )}
                </div>

                <div className={styles.footer}>
                    <button className={styles.cancelBtn} onClick={onCancel}>
                        {cancelLabel}
                    </button>
                    <button
                        className={`${styles.confirmBtn} ${isDanger ? styles.dangerBtn : ''}`}
                        onClick={() => onConfirm(inputConfig ? inputValue : undefined)}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};
