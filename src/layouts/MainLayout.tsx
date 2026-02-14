import React, { useState, useEffect } from 'react';
import { TitleBar } from '../components/TitleBar';
import { Sidebar } from '../components/Sidebar';
import { CrashReportModal } from '../components/CrashReportModal';
import styles from './MainLayout.module.css';
import bgImage from '../assets/bg.jpg';

interface MainLayoutProps {
    children: React.ReactNode;
    activeTab: string;
    onTabChange: (tab: string) => void;
    user: {
        name: string;
        uuid: string;
        token: string;
    };
    onLogout?: () => void;
    isNavLocked?: boolean;
}

export const MainLayout: React.FC<MainLayoutProps> = ({ children, activeTab, onTabChange, user, onLogout, isNavLocked }) => {
    const [crashReport, setCrashReport] = useState<any>(null);
    const [crashLog, setCrashLog] = useState('');

    useEffect(() => {
        const handleCrash = (_event: any, data: any) => {
            console.log("Crash event received", data);
            setCrashReport(data.report);
            setCrashLog(data.log);
        };

        window.ipcRenderer.on('launch:crash', handleCrash);
        return () => {
            // Cleanup would require removeListener exposed via preload, assuming handled or component is persistent
        };
    }, []);

    const handleTabChange = (tab: string) => {
        if (isNavLocked) {
            // Don't allow navigation when locked
            return;
        }
        onTabChange(tab);
    };

    return (
        <div className={styles.layout}>
            <div className={styles.background} style={{ backgroundImage: `url(${bgImage})` }}></div>

            <TitleBar />

            <div className={styles.body}>
                <Sidebar 
                    activeTab={activeTab} 
                    onTabChange={handleTabChange} 
                    user={user} 
                    onLogout={onLogout}
                    isNavLocked={isNavLocked}
                />

                <main className={styles.content}>
                    {children}
                </main>
            </div>

            {crashReport && (
                <CrashReportModal
                    report={crashReport}
                    log={crashLog}
                    onClose={() => setCrashReport(null)}
                />
            )}
        </div>
    );
};
