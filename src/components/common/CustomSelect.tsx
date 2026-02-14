import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import styles from './CustomSelect.module.css';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface Option {
    value: string;
    label: string;
    disabled?: boolean;
    badge?: string;
}

interface CustomSelectProps {
    value: string;
    onChange: (value: string) => void;
    options: Option[];
    placeholder?: string;
    disabled?: boolean;
    searchable?: boolean;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({ value, onChange, options, placeholder = "Select...", disabled = false, searchable = true }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [position, setPosition] = useState({ top: 0, left: 0, width: 0 });
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const updatePosition = useCallback(() => {
        if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + window.scrollY + 5,
                left: rect.left + window.scrollX,
                width: rect.width
            });
        }
    }, []);

    const toggleOpen = () => {
        if (!disabled) {
            if (!isOpen) {
                updatePosition();
                setIsOpen(true);
            } else {
                setIsOpen(false);
            }
        }
    };

    const handleSelect = (optionValue: string) => {
        onChange(optionValue);
        setIsOpen(false);
        setSearchQuery('');
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                // Check if click is inside the portal dropdown
                const dropdown = document.getElementById('custom-select-dropdown');
                if (dropdown && !dropdown.contains(event.target as Node)) {
                    setIsOpen(false);
                }
            }
        };

        const handleScroll = () => {
            if (isOpen) updatePosition(); // Optional: or setIsOpen(false)
        };

        const handleResize = () => {
            if (isOpen) setIsOpen(false);
        }

        window.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('scroll', handleScroll, true); // Capture phase for all scrolling elements
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', handleResize);
        };
    }, [isOpen, updatePosition]);

    useEffect(() => {
        if (isOpen && searchable && inputRef.current) {
            inputRef.current.focus();
        }
        if (!isOpen) {
            setSearchQuery('');
        }
    }, [isOpen, searchable]);

    const selectedOption = options.find(opt => opt.value === value);

    const filteredOptions = options.filter(opt =>
        !searchQuery || opt.label.toLowerCase().includes(searchQuery.toLowerCase()) || opt.value.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const dropdownContent = (
        <div
            id="custom-select-dropdown"
            className={styles.dropdown}
            style={{
                position: 'fixed',
                top: position.top - window.scrollY, // Adjust because we want fixed relative to viewport
                left: position.left - window.scrollX,
                width: position.width,
                zIndex: 9999
            }}
            onMouseDown={(e) => e.stopPropagation()} // Prevent closing when clicking inside
        >
            {searchable && (
                <input
                    ref={inputRef}
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                />
            )}
            <div className={styles.optionsList}>
                {filteredOptions.length > 0 ? (
                    filteredOptions.map(option => (
                        <div
                            key={option.value}
                            className={`${styles.option} ${option.value === value ? styles.selected : ''} ${option.disabled ? styles.disabled : ''}`}
                            onClick={() => !option.disabled && handleSelect(option.value)}
                        >
                            <span className={styles.optionLabel}>{option.label}</span>
                            {option.badge && <span className={styles.optionBadge}>{option.badge}</span>}
                        </div>
                    ))
                ) : (
                    <div className={styles.option} style={{ cursor: 'default', color: '#666' }}>
                        No results found
                    </div>
                )}
            </div>
        </div>
    );

    return (
        <div className={styles.container} ref={containerRef}>
            <div className={`${styles.trigger} ${isOpen ? styles.open : ''} ${disabled ? styles.disabled : ''}`} onClick={toggleOpen}>
                <span className={styles.value}>{selectedOption ? selectedOption.label : placeholder}</span>
                <span className={styles.icon}>
                    {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </span>
            </div>

            {isOpen && createPortal(dropdownContent, document.body)}
        </div>
    );
};
