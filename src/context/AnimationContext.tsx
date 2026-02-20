import React, { createContext, useContext, useState, useEffect } from 'react';

interface AnimationContextType {
  animationsEnabled: boolean;
  setAnimationsEnabled: (enabled: boolean) => void;
  animationClass: string;
}

const AnimationContext = createContext<AnimationContextType>({
  animationsEnabled: true,
  setAnimationsEnabled: () => { },
  animationClass: '',
});

export const AnimationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [animationsEnabled, setAnimationsEnabled] = useState(() => {
    const saved = localStorage.getItem('yashin-animations');
    return saved !== null ? saved === 'true' : true;
  });

  useEffect(() => {
    localStorage.setItem('yashin-animations', animationsEnabled.toString());
  }, [animationsEnabled]);

  const animationClass = animationsEnabled ? '' : 'animations-disabled';

  return (
    <AnimationContext.Provider value={{ animationsEnabled, setAnimationsEnabled, animationClass }}>
      {children}
    </AnimationContext.Provider>
  );
};

export const useAnimation = () => useContext(AnimationContext);
