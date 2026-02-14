import React, { useState, useEffect } from 'react';
import { SkinUtils } from '../utils/SkinUtils';
import whoapSkin from '../assets/whoap-skin.png';
import steveFace from '../assets/steve.png';

interface UserAvatarProps {
    username: string;
    preferredSkin?: string;
    uuid?: string;
    className?: string;
    accountType?: 'microsoft' | 'whoap' | 'offline';
    variant?: 'face' | 'body';
    lastUpdated?: number; // For cache-busting local custom skins
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
    username,
    preferredSkin,
    uuid,
    className,
    accountType,
    variant = 'face',
    lastUpdated
}) => {
    // Determine the fallback image based on variant
    const fallbackSrc = variant === 'body' ? whoapSkin : steveFace;

    // Determine the primary URL to try fetching
    const getPrimaryUrl = () => {
        // Prioritize preferredSkin if provided and user is whoap/offline
        const identifier = preferredSkin || ((accountType === 'microsoft' && uuid) ? uuid : username);

        // If it's a body request for a custom skin, show the default Whoap skin
        if (variant === 'body' && SkinUtils.isCustom(identifier)) {
            return whoapSkin;
        }

        return SkinUtils.getSkinUrl(identifier, variant, lastUpdated);
    };

    const [currentSrc, setCurrentSrc] = useState<string>(fallbackSrc);
    // Track if we are showing a processed face (canvas data URL)
    const [isProcessed, setIsProcessed] = useState(false);

    useEffect(() => {
        setIsProcessed(false);
        const url = getPrimaryUrl();

        // If it's a local skin file and we want the face, we need to crop it
        if (SkinUtils.isCustom(url) && variant === 'face') {
            const img = new Image();
            // Don't set crossOrigin for our own custom protocols as it can sometimes block them
            if (!url.startsWith('whoap-')) {
                img.crossOrigin = 'Anonymous';
            }

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = 8;
                    canvas.height = 8;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        // Face is at 8, 8 with size 8x8
                        ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8);

                        // Add Hat Layer (optional but nice) - located at 40, 8, size 8x8
                        if (img.width >= 64) {
                            ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8);
                        }

                        setCurrentSrc(canvas.toDataURL());
                        setIsProcessed(true);
                    } else {
                        setCurrentSrc(url);
                    }
                } catch (e) {
                    console.error('[UserAvatar] Failed to crop custom skin', e);
                    setCurrentSrc(url);
                }
            };
            img.onerror = (err) => {
                console.warn('[UserAvatar] Image load error for custom skin', url, err);
                setCurrentSrc(fallbackSrc);
            };
            img.src = url;
        } else {
            setCurrentSrc(url);
        }
    }, [username, uuid, accountType, variant, preferredSkin, lastUpdated]);

    const handleError = () => {
        // If the processed image fails (unlikely) or network fails
        if (currentSrc !== fallbackSrc && !isProcessed) {
            setCurrentSrc(fallbackSrc);
        }
    };

    return (
        <img
            src={currentSrc}
            alt={username}
            className={className}
            onError={handleError}
            style={{
                objectFit: 'contain',
                imageRendering: 'pixelated'
            }}
        />
    );
};
