import React, { useState, useEffect } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { Screenshot, ScreenshotApi } from '../api/screenshots';

interface ScreenshotImageProps {
    screenshot: Screenshot;
    className?: string;
    alt?: string;
}

export const ScreenshotImage: React.FC<ScreenshotImageProps> = ({ screenshot, className, alt }) => {
    const [imageSrc, setImageSrc] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const loadImage = async () => {
            try {
                const result = await ScreenshotApi.getImage(screenshot.path);
                if (isMounted) {
                    if (result.success && result.dataUrl) {
                        setImageSrc(result.dataUrl);
                        setError(false);
                    } else {
                        setError(true);
                    }
                    setLoading(false);
                }
            } catch (e) {
                if (isMounted) {
                    setError(true);
                    setLoading(false);
                }
            }
        };

        loadImage();

        return () => {
            isMounted = false;
        };
    }, [screenshot.path]);

    if (loading) {
        return (
            <div className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a' }}>
                <span style={{ color: '#666', fontSize: '12px' }}>Loading...</span>
            </div>
        );
    }

    if (error || !imageSrc) {
        return (
            <div className={className} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a1a' }}>
                <ImageIcon size={32} color="#666" />
            </div>
        );
    }

    return <img src={imageSrc} alt={alt || screenshot.filename} className={className} />;
};
