import { createContext, useContext, useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  resolveAndApplyThemeRuntime,
  type Theme,
  type ThemeRuntimeOptions,
  type ThemeRuntime,
} from '@/theme.js';

const DIM_COLOR = '#222222';

function dimValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value === 'transparent' ? value : DIM_COLOR;
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      result[k] = dimValue(v);
    }
    return result;
  }
  return value;
}

function buildDimTheme(source: Theme): Theme {
  return dimValue(source) as Theme;
}

type ThemeContextValue = {
  theme: Theme;
  originalTheme: Theme;
  getColor: (path: string) => string;
  runtime: ThemeRuntime;
  dimMode: boolean;
  setDimMode: (dim: boolean) => void;
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

  const [dimMode, setDimMode] = useState(false);

  const activeTheme = dimMode ? buildDimTheme(runtime.theme) : runtime.theme;

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
      originalTheme: runtime.theme,
      getColor,
      runtime,
      dimMode,
      setDimMode,
    }),
    [activeTheme, getColor, runtime, dimMode],
  );

  return <ThemeContext.Provider value={contextValue}>{children}</ThemeContext.Provider>;
}

export function UndimmedThemeProvider({ children }: { children: ReactNode }) {
  const parent = useTheme();
  const value = useMemo<ThemeContextValue>(
    () => ({ ...parent, theme: parent.originalTheme }),
    [parent],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
