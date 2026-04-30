import { createContext, useContext, useMemo, type ReactNode } from 'react';

type AltModeContextType = {
  altMode: boolean;
};

const AltModeContext = createContext<AltModeContextType | undefined>(undefined);

export const AltModeProvider = ({ children, altMode = false }: { children: ReactNode; altMode?: boolean }) => {
  const value = useMemo(() => ({ altMode }), [altMode]);
  return <AltModeContext.Provider value={value}>{children}</AltModeContext.Provider>;
};

export const useAltMode = () => {
  const context = useContext(AltModeContext);
  if (!context) {
    console.warn('useAltMode used outside AltModeProvider, using defaults');
    return {
      altMode: false,
    };
  }
  return context;
};
