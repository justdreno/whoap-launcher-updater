import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import styles from './NewsCard.module.css';
import { Calendar, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';

interface NewsCardProps {
    title: string;
    content: string;
    date: string;
    category?: string;
    imageUrl?: string;
    color?: string;
    linkUrl?: string;
}

export const NewsCard: React.FC<NewsCardProps> = ({
    title,
    content,
    date,
    category = 'Update',
    imageUrl,
    color = '#ff8800',
    linkUrl
}) => {
    const [expanded, setExpanded] = useState(false);
    const isLongContent = content.length > 200;

    const formatDate = (dateStr: string) => {
        try {
            return new Date(dateStr).toLocaleDateString(undefined, {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
            });
        } catch {
            return dateStr;
        }
    };

    return (
        <div
            className={`${styles.card} ${expanded ? styles.expanded : ''}`}
            style={{ '--card-accent': color } as React.CSSProperties}
        >
            {imageUrl && (
                <div
                    className={styles.imageHeader}
                    style={{ backgroundImage: `url(${imageUrl})` }}
                >
                    <div className={styles.categoryBadge} style={{ backgroundColor: color }}>
                        {category}
                    </div>
                </div>
            )}

            <div className={styles.content}>
                {!imageUrl && (
                    <div className={styles.categoryTag} style={{ color }}>
                        {category}
                    </div>
                )}

                <h3 className={styles.title}>{title}</h3>

                <div className={styles.meta}>
                    <Calendar size={14} />
                    <span>{formatDate(date)}</span>
                </div>

                <div className={`${styles.markdown} ${!expanded && isLongContent ? styles.clamped : ''}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>
                        {content}
                    </ReactMarkdown>
                </div>

                {isLongContent && (
                    <button
                        className={styles.expandBtn}
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? (
                            <>Show Less <ChevronUp size={16} /></>
                        ) : (
                            <>Read More <ChevronDown size={16} /></>
                        )}
                    </button>
                )}

                {linkUrl && (
                    <button
                        onClick={() => window.ipcRenderer.invoke('app:open-external', linkUrl)}
                        className={styles.externalLink}
                    >
                        <ExternalLink size={16} />
                        Read More
                    </button>
                )}
            </div>
        </div>
    );
};
