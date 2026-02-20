import { useState, useEffect } from 'react';
import { useOfflineStatus } from './useOfflineStatus';

interface TransitionState {
  isTransitioning: boolean;
  previousState: boolean;
  currentState: boolean;
}

export function useOfflineTransition(): TransitionState {
  const isOffline = useOfflineStatus();
  const [state, setState] = useState<TransitionState>({
    isTransitioning: false,
    previousState: isOffline,
    currentState: isOffline
  });

  useEffect(() => {
    if (isOffline !== state.currentState) {
      // Start transition
      setState(prev => ({
        ...prev,
        isTransitioning: true,
        previousState: prev.currentState
      }));

      // End transition after animation
      const timer = setTimeout(() => {
        setState({
          isTransitioning: false,
          previousState: isOffline,
          currentState: isOffline
        });
      }, 300);

      return () => clearTimeout(timer);
    }
  }, [isOffline, state.currentState]);

  return state;
}

// Hook for animating content changes
export function useAnimatedContent<T>(
  content: T,
  duration: number = 300
): { value: T; isAnimating: boolean } {
  const [state, setState] = useState({
    value: content,
    isAnimating: false
  });

  useEffect(() => {
    if (content !== state.value) {
      setState(prev => ({ ...prev, isAnimating: true }));
      
      const timer = setTimeout(() => {
        setState({
          value: content,
          isAnimating: false
        });
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [content, duration, state.value]);

  return state;
}
