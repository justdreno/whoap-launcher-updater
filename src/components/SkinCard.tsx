import React from 'react';
import styles from './SkinCard.module.css';
import { PublicProfile } from '../types/profile';
import { SkinViewer3D } from './SkinViewer3D';
import { Calendar } from 'lucide-react';

interface SkinCardProps {
    profile: PublicProfile;
    onClick: () => void;
}

export const SkinCard: React.FC<SkinCardProps> = ({ profile, onClick }) => {
    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return 'Today';
        if (diffDays === 1) return 'Yesterday';
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <div className={styles.card} onClick={onClick}>
            <div className={styles.skinPreview}>
                {profile.skin_url ? (
                    <SkinViewer3D
                        skinUrl={profile.skin_url}
                        capeUrl={profile.cape_url || null}
                        width={90}
                        height={130}
                        autoRotate={false}
                        enableZoom={false}
                        className={styles.skinCanvas}
                    />
                ) : (
                    <div className={styles.noSkin}>?</div>
                )}
            </div>
            <div className={styles.info}>
                <span className={styles.username}>{profile.username}</span>
                <div className={styles.meta}>
                    <Calendar size={11} />
                    <span>{formatDate(profile.joined_at)}</span>
                </div>
            </div>
        </div>
    );
};
