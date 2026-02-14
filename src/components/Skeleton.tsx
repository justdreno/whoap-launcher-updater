import React from 'react';
import styles from './Skeleton.module.css';

interface SkeletonProps {
    width?: string | number;
    height?: string | number;
    variant?: 'text' | 'circle' | 'rect' | 'title';
    className?: string;
    style?: React.CSSProperties;
}

export const Skeleton: React.FC<SkeletonProps> = ({
    width,
    height,
    variant = 'rect',
    className = '',
    style = {}
}) => {
    const variantClass = styles[variant] || '';

    return (
        <div
            className={`${styles.skeleton} ${variantClass} ${className}`}
            style={{ width, height, ...style }}
        />
    );
};
