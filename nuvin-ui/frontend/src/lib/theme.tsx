import { createContext, useContext, useEffect } from 'react';
import { useUserPreferenceStore } from '@/store/useUserPreferenceStore';
import { themes, themeNames, ThemeName } from '@/themes';

type Theme = ThemeName | 'system';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolvedTheme: ThemeName;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

interface ThemeProviderProps {
  children: React.ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const { preferences, updatePreferences } = useUserPreferenceStore();
  const theme = preferences.theme;

  const setTheme = (newTheme: Theme) => {
    updatePreferences({ theme: newTheme });
  };

  const getSystemTheme = (): 'light' | 'dark' => {
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  };

  const resolvedTheme: ThemeName =
    theme === 'system' ? getSystemTheme() : (theme as ThemeName);

  // Apply initial theme on mount
  useEffect(() => {
    const root = window.document.documentElement;
    const initialTheme = theme === 'system' ? getSystemTheme() : (theme as ThemeName);

    root.classList.remove(...themeNames);
    root.classList.add(initialTheme);

    const vars = themes[initialTheme];
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
  }, []); // Run only on mount

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove(...themeNames);
    root.classList.add(resolvedTheme);

    const vars = themes[resolvedTheme];
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
  }, [resolvedTheme]);

  // Listen for system theme changes when using 'system' theme
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const root = window.document.documentElement;
      const systemTheme = mediaQuery.matches ? 'dark' : 'light';

      root.classList.remove(...themeNames);
      root.classList.add(systemTheme);

      const vars = themes[systemTheme];
      Object.entries(vars).forEach(([key, value]) => {
        root.style.setProperty(`--${key}`, value);
      });
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}