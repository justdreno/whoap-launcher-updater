import React from 'react';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
    title: string;
    description: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, description }) => {
    return (
        <div className={styles.header}>
            <h1 className={styles.title}>{title}</h1>
            <p className={styles.description}>{description}</p>
            <hr className={styles.divider} />
        </div>
    );
};
