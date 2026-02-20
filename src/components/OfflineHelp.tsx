import React, { useState } from 'react';
import styles from './OfflineHelp.module.css';
import { X, WifiOff, Cloud, CheckCircle, AlertCircle, RotateCcw, BookOpen } from 'lucide-react';

interface OfflineHelpProps {
  onClose: () => void;
}

interface HelpSection {
  id: string;
  icon: React.ReactNode;
  title: string;
  content: string;
}

const helpSections: HelpSection[] = [
  {
    id: 'what-is-offline',
    icon: <WifiOff size={20} />,
    title: 'What is Offline Mode?',
    content: 'Offline mode allows you to use Whoap Launcher even without an internet connection. You can create, edit, and manage your Minecraft instances, view cached news and skins, and queue changes that will sync automatically when you reconnect.'
  },
  {
    id: 'how-sync-works',
    icon: <Cloud size={20} />,
    title: 'How Does Sync Work?',
    content: 'When you make changes while offline, they\'re saved to your local device and added to a sync queue. Once you reconnect to the internet, these changes are automatically uploaded to the cloud. You can view your sync queue by clicking the sync icon in the header.'
  },
  {
    id: 'what-gets-cached',
    icon: <CheckCircle size={20} />,
    title: 'What Gets Cached?',
    content: 'We cache Minecraft version lists, mod loader versions, news articles, changelogs, and player skins. Cached content shows a "Last updated" timestamp so you know how fresh it is. Most cache expires after 7-30 days and refreshes automatically.'
  },
  {
    id: 'sync-conflicts',
    icon: <AlertCircle size={20} />,
    title: 'Handling Sync Conflicts',
    content: 'If you edit the same instance on multiple devices, you might encounter sync conflicts. When this happens, you\'ll see a conflict resolution screen where you can choose to keep your local version, use the cloud version, or merge changes.'
  },
  {
    id: 'retry-failed',
    icon: <RotateCcw size={20} />,
    title: 'Retrying Failed Syncs',
    content: 'If a sync fails due to network issues, it will automatically retry with exponential backoff (1 second, 5 seconds, 15 seconds, etc.). You can also manually retry failed actions from the sync queue viewer.'
  }
];

export const OfflineHelp: React.FC<OfflineHelpProps> = ({ onClose }) => {
  const [expandedSection, setExpandedSection] = useState<string | null>('what-is-offline');

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <BookOpen size={20} />
            <h2>Offline Mode Guide</h2>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className={styles.content}>
          <p className={styles.intro}>
            Learn how Whoap Launcher works offline and keeps your data in sync across devices.
          </p>

          <div className={styles.sections}>
            {helpSections.map((section) => (
              <div
                key={section.id}
                className={`${styles.section} ${expandedSection === section.id ? styles.expanded : ''}`}
              >
                <button
                  className={styles.sectionHeader}
                  onClick={() => setExpandedSection(
                    expandedSection === section.id ? null : section.id
                  )}
                >
                  <div className={styles.sectionIcon}>{section.icon}</div>
                  <span className={styles.sectionTitle}>{section.title}</span>
                  <div className={styles.expandIcon}>
                    {expandedSection === section.id ? '−' : '+'}
                  </div>
                </button>

                {expandedSection === section.id && (
                  <div className={styles.sectionContent}>
                    <p>{section.content}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={styles.tips}>
            <h3>Quick Tips</h3>
            <ul>
              <li>Look for the offline indicator in the header when working without internet</li>
              <li>Changes sync automatically when you reconnect - no manual action needed</li>
              <li>Cached content shows "Last updated" timestamps so you know its age</li>
              <li>Check the sync queue viewer to see pending changes and their status</li>
              <li>Failed syncs retry automatically up to 5 times with increasing delays</li>
            </ul>
          </div>
        </div>

        <div className={styles.footer}>
          <button className={styles.doneBtn} onClick={onClose}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

export default OfflineHelp;
