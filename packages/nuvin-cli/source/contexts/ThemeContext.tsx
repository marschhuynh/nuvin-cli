import { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react';
import { theme, type Theme } from '@/theme.js';

export type { Theme };

type ThemeContextValue = {
  theme: Theme;
  getColor: (path: string) => string;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const getColor = useCallback((path: string): string => {
    const parts = path.split('.');
    let value: unknown = theme;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return 'white';
      }
    }

    return typeof value === 'string' ? value : 'white';
  }, []);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme,
      getColor,
    }),
    [getColor],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
