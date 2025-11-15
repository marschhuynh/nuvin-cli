import { createContext, useContext, useState, useMemo, useCallback, type ReactNode } from 'react';

type ExplainModeContextType = {
  explainMode: boolean;
  toggleExplainMode: () => void;
  setExplainMode: (enabled: boolean) => void;
};

const ExplainModeContext = createContext<ExplainModeContextType | undefined>(undefined);

export const ExplainModeProvider = ({ children }: { children: ReactNode }) => {
  const [explainMode, setExplainModeState] = useState(false);

  const toggleExplainMode = useCallback(() => {
    setExplainModeState((prev) => !prev);
  }, []);

  const setExplainMode = useCallback((enabled: boolean) => {
    setExplainModeState(enabled);
  }, []);

  const value = useMemo(
    () => ({ explainMode, toggleExplainMode, setExplainMode }),
    [explainMode, toggleExplainMode, setExplainMode],
  );

  return <ExplainModeContext.Provider value={value}>{children}</ExplainModeContext.Provider>;
};

export const useExplainMode = () => {
  const context = useContext(ExplainModeContext);
  if (!context) {
    console.warn('useExplainMode used outside ExplainModeProvider, using defaults');
    return {
      explainMode: false,
      toggleExplainMode: () => {},
      setExplainMode: () => {},
    };
  }
  return context;
};
