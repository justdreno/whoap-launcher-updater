import React, { useState, useRef, useEffect } from 'react';
import styles from './CustomSelect.module.css';
import { ChevronDown, Check } from 'lucide-react';

export interface Option {
    value: string;
    label: string;
    icon?: React.ReactNode;
    color?: string;
}

interface CustomSelectProps {
    value: string;
    options: Option[];
    onChange: (value: string) => void;
    placeholder?: string;
    width?: string | number;
    className?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
    value,
    options,
    onChange,
    placeholder = 'Select...',
    width = '100%',
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedOption = options.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
    };

    return (
        <div
            className={`${styles.container} ${className} ${isOpen ? styles.open : ''}`}
            style={{ width }}
            ref={containerRef}
        >
            <div
                className={styles.trigger}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div className={styles.selectedValue}>
                    {selectedOption ? (
                        <>
                            {selectedOption.icon && <span className={styles.icon}>{selectedOption.icon}</span>}
                            <span style={{ color: selectedOption.color }}>{selectedOption.label}</span>
                        </>
                    ) : (
                        <span className={styles.placeholder}>{placeholder}</span>
                    )}
                </div>
                <ChevronDown size={16} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} />
            </div>

            {isOpen && (
                <div className={styles.dropdown}>
                    {options.map((option) => (
                        <div
                            key={option.value}
                            className={`${styles.option} ${option.value === value ? styles.selected : ''}`}
                            onClick={() => handleSelect(option.value)}
                        >
                            <div className={styles.optionContent}>
                                {option.icon && <span className={styles.optionIcon}>{option.icon}</span>}
                                <span style={{ color: option.color }}>{option.label}</span>
                            </div>
                            {option.value === value && <Check size={14} className={styles.check} />}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
