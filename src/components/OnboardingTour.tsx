import React, { useState, useEffect } from 'react';
import styles from './OnboardingTour.module.css';
import { X, ChevronRight, ChevronLeft, WifiOff, Cloud, CheckCircle, AlertCircle } from 'lucide-react';

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  target?: string;
}

const tourSteps: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Offline Mode',
    description: 'Whoap Launcher now works seamlessly even without internet. Your changes are saved locally and synced when you reconnect.',
    icon: <WifiOff size={32} />
  },
  {
    id: 'sync-queue',
    title: 'Sync Queue',
    description: 'When you make changes offline, they\'re added to your sync queue. Click the sync icon in the header to see pending changes and sync status.',
    icon: <Cloud size={32} />,
    target: '.sync-status'
  },
  {
    id: 'offline-indicator',
    title: 'Offline Indicator',
    description: 'Look for the subtle offline indicator in the header. It shows when you\'re working offline and changes are being queued.',
    icon: <WifiOff size={32} />,
    target: '.offline-indicator'
  },
  {
    id: 'cached-content',
    title: 'Cached Content',
    description: 'News, skins, and version lists are cached for offline viewing. Look for "Last updated" timestamps to see cache age.',
    icon: <CheckCircle size={32} />
  },
  {
    id: 'conflicts',
    title: 'Sync Conflicts',
    description: 'If you edit the same content on multiple devices, we\'ll help you resolve conflicts. You can choose to keep local or cloud versions.',
    icon: <AlertCircle size={32} />
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'Work offline with confidence. All your changes will sync automatically when you reconnect. Enjoy uninterrupted Minecraft!',
    icon: <CheckCircle size={32} />
  }
];

const TOUR_STORAGE_KEY = 'whoap_offline_tour_completed';

export const OnboardingTour: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Check if user has seen the tour
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    if (!completed) {
      // Delay showing the tour slightly
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleNext = () => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    completeTour();
  };

  const completeTour = () => {
    localStorage.setItem(TOUR_STORAGE_KEY, 'true');
    setIsVisible(false);
  };

  if (!isVisible) {
    return null;
  }

  const step = tourSteps[currentStep];
  const isLastStep = currentStep === tourSteps.length - 1;
  const isFirstStep = currentStep === 0;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <button className={styles.skipBtn} onClick={handleSkip}>
          <X size={18} />
        </button>

        <div className={styles.content}>
          <div className={styles.iconWrapper}>
            {step.icon}
          </div>

          <div className={styles.stepIndicator}>
            {tourSteps.map((_, index) => (
              <div
                key={index}
                className={`${styles.dot} ${index === currentStep ? styles.active : ''} ${
                  index < currentStep ? styles.completed : ''
                }`}
              />
            ))}
          </div>

          <h2 className={styles.title}>{step.title}</h2>
          <p className={styles.description}>{step.description}</p>
        </div>

        <div className={styles.footer}>
          <div className={styles.progress}>
            Step {currentStep + 1} of {tourSteps.length}
          </div>

          <div className={styles.actions}>
            {!isFirstStep && (
              <button className={styles.secondaryBtn} onClick={handlePrevious}>
                <ChevronLeft size={16} />
                Back
              </button>
            )}
            
            <button className={styles.primaryBtn} onClick={handleNext}>
              {isLastStep ? 'Get Started' : 'Next'}
              {!isLastStep && <ChevronRight size={16} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// Hook to check if user needs tour
export function useNeedsOnboarding(): boolean {
  const [needsTour, setNeedsTour] = useState(false);

  useEffect(() => {
    const completed = localStorage.getItem(TOUR_STORAGE_KEY);
    setNeedsTour(!completed);
  }, []);

  return needsTour;
}

// Reset tour (for testing or settings)
export function resetOnboardingTour(): void {
  localStorage.removeItem(TOUR_STORAGE_KEY);
  window.location.reload();
}

export default OnboardingTour;
