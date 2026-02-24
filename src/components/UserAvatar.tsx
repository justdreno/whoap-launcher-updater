import React, { useState, useEffect } from 'react';
import { SkinUtils } from '../utils/SkinUtils';
import yashinSkin from '../assets/yashin-skin.png';
import steveFace from '../assets/steve.png';

interface UserAvatarProps {
    username: string;
    preferredSkin?: string;
    uuid?: string;
    className?: string;
    accountType?: 'microsoft' | 'yashin' | 'offline';
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
    const fallbackSrc = variant === 'body' ? yashinSkin : steveFace;

    // Determine the primary URL to try fetching
    const getPrimaryUrl = () => {
        // If no preferredSkin is provided, we want to show Steve (don't use username as skin)
        if (!preferredSkin) {
            return null; // Will trigger fallback to Steve
        }

        // If preferredSkin is already a URL (cloud uploaded), use it directly
        if (preferredSkin.startsWith('http://') || preferredSkin.startsWith('https://')) {
            return preferredSkin;
        }

        // Prioritize preferredSkin if provided
        const identifier = preferredSkin;

        // If it's a body request for a custom skin, show the default Yashin skin
        if (variant === 'body' && SkinUtils.isCustom(identifier)) {
            return yashinSkin;
        }

        return SkinUtils.getSkinUrl(identifier, variant, lastUpdated);
    };

    const [currentSrc, setCurrentSrc] = useState<string>(fallbackSrc);
    // Track if we are showing a processed face (canvas data URL)
    const [isProcessed, setIsProcessed] = useState(false);

    useEffect(() => {
        setIsProcessed(false);

        const url = getPrimaryUrl();

        // If no URL (no skin set), use default Steve skin immediately
        if (!url) {
            setCurrentSrc(fallbackSrc);
            return;
        }

        // If it's a local custom skin file and we want the face, we need to crop it from the skin texture
        // Note: mc-heads.net /avatar/ URLs already return pre-cropped faces, so don't crop those
        const isCustomSkin = SkinUtils.isCustom(url) || url.startsWith('yashin-skin://');
        if (isCustomSkin && variant === 'face') {
            const img = new Image();
            // Don't set crossOrigin for our own custom protocols as it can sometimes block them
            if (!url.startsWith('yashin-')) {
                img.crossOrigin = 'Anonymous';
            }

            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    // Use larger canvas for better quality when displayed
                    canvas.width = 64;
                    canvas.height = 64;
                    const ctx = canvas.getContext('2d');
                    if (ctx) {
                        // Disable smoothing for pixelated look
                        ctx.imageSmoothingEnabled = false;

                        // Face is at 8, 8 with size 8x8 on the skin
                        // Draw it scaled up to fill the 64x64 canvas
                        ctx.drawImage(img, 8, 8, 8, 8, 0, 0, 64, 64);

                        // Add Hat Layer (optional but nice) - located at 40, 8, size 8x8
                        if (img.width >= 64) {
                            ctx.drawImage(img, 40, 8, 8, 8, 0, 0, 64, 64);
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
