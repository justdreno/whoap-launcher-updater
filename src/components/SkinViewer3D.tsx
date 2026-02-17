import React from 'react';
import * as skinview3d from 'skinview3d';
import { SkinUtils } from '../utils/SkinUtils';

interface SkinViewer3DProps {
    skinUrl?: string; // name or file:name
    capeUrl?: string | null;
    width?: number;
    height?: number;
    className?: string;
    lastUpdated?: number; // Cache buster
    autoRotate?: boolean;
    autoRotateSpeed?: number;
    enableZoom?: boolean;
    initialRotation?: { y?: number; x?: number };
    facing?: 'left' | 'right';
}

export const SkinViewer3D: React.FC<SkinViewer3DProps> = ({
    skinUrl,
    capeUrl,
    width = 300,
    height = 400,
    className,
    lastUpdated,
    autoRotate = false,
    autoRotateSpeed = 0.5,
    enableZoom = false,
    initialRotation = { y: 0, x: 0 },
    facing = 'right'
}) => {
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const viewerRef = React.useRef<skinview3d.SkinViewer | null>(null);

    React.useEffect(() => {
        if (!canvasRef.current) return;

        const viewer = new skinview3d.SkinViewer({
            canvas: canvasRef.current,
            width,
            height,
            alpha: true,
        } as any);

        // Configure viewer
        viewer.autoRotate = autoRotate;
        viewer.autoRotateSpeed = autoRotateSpeed;
        viewer.controls.enableZoom = enableZoom;

        // Set facing direction
        const baseRotation = facing === 'right' ? 1.5 : -1.5;
        if (initialRotation.y !== undefined) {
            viewer.camera.rotation.y = baseRotation + initialRotation.y;
        } else {
            viewer.camera.rotation.y = baseRotation;
        }
        if (initialRotation.x !== undefined) viewer.camera.rotation.x = initialRotation.x;

        // Always use walking animation
        viewer.animation = new skinview3d.WalkingAnimation();
        viewer.animation.speed = 1.5;

        // Load initial skin/cape
        const resolvedSkin = SkinUtils.getSkinUrl(skinUrl, 'body', lastUpdated);
        const resolvedCape = capeUrl ? SkinUtils.getCapeUrl(capeUrl, lastUpdated) : null;

        if (resolvedSkin) viewer.loadSkin(resolvedSkin);
        if (resolvedCape) viewer.loadCape(resolvedCape);

        viewerRef.current = viewer;

        return () => {
            viewer.dispose();
            viewerRef.current = null;
        };
    }, []);

    // Handle Updates
    React.useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        const resolvedSkin = SkinUtils.getSkinUrl(skinUrl, 'body', lastUpdated);
        const resolvedCape = capeUrl ? SkinUtils.getCapeUrl(capeUrl, lastUpdated) : null;

        if (resolvedSkin) viewer.loadSkin(resolvedSkin);
        if (resolvedCape) {
            viewer.loadCape(resolvedCape);
        } else {
            viewer.loadCape(null as any);
        }
    }, [skinUrl, capeUrl, lastUpdated]);

    // Handle Config Updates
    React.useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        viewer.autoRotate = autoRotate;
        viewer.autoRotateSpeed = autoRotateSpeed;
        viewer.controls.enableZoom = enableZoom;
    }, [autoRotate, autoRotateSpeed, enableZoom]);

    return (
        <canvas
            ref={canvasRef}
            className={className}
        />
    );
};
