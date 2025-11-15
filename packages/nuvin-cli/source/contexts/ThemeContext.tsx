import { createContext, useContext, type ReactNode } from 'react';
import { theme, type Theme } from '@/theme.js';
// import { theme, type Theme } from '@/theme.js';

type ThemeContextValue = {
  theme: Theme;
  getColor: (path: string) => string;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

type ThemeProviderProps = {
  children: ReactNode;
};

export function ThemeProvider({ children }: ThemeProviderProps) {
  const getColor = (path: string): string => {
    const parts = path.split('.');
    let value: unknown = theme;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return 'white'; // Default fallback
      }
    }

    return typeof value === 'string' ? value : 'white';
  };

  const contextValue: ThemeContextValue = {
    theme,
    getColor,
  };

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
