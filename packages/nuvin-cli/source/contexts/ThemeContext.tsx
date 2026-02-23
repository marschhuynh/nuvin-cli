import { createContext, useContext, useCallback, useMemo, type ReactNode } from 'react';
import {
  resolveAndApplyThemeRuntime,
  type Theme,
  type ThemeRuntimeOptions,
  type ThemeRuntime,
} from '@/theme.js';

type ThemeContextValue = {
  theme: Theme;
  getColor: (path: string) => string;
  runtime: ThemeRuntime;
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

type ThemeProviderProps = {
  children: ReactNode;
  options?: ThemeRuntimeOptions;
};

export function ThemeProvider({ children, options }: ThemeProviderProps) {
  const runtime = useMemo(
    () =>
      resolveAndApplyThemeRuntime({
        mode: options?.mode,
        backgrounds: options?.backgrounds,
        colorLevel: options?.colorLevel,
        env: options?.env,
        stdout: options?.stdout,
      }),
    [options?.backgrounds, options?.colorLevel, options?.env, options?.mode, options?.stdout],
  );

  const activeTheme = runtime.theme;

  const getColor = useCallback((path: string): string => {
    const parts = path.split('.');
    let value: unknown = activeTheme;

    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = (value as Record<string, unknown>)[part];
      } else {
        return 'white';
      }
    }

    return typeof value === 'string' ? value : 'white';
  }, [activeTheme]);

  const contextValue = useMemo<ThemeContextValue>(
    () => ({
      theme: activeTheme,
      getColor,
      runtime,
    }),
    [activeTheme, getColor, runtime],
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
