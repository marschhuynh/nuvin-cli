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
  const { preferences, updatePreferences, hasHydrated } = useUserPreferenceStore();
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
    theme === 'system' ? getSystemTheme() : 
    (theme && theme in themes ? theme as ThemeName : 'light');

  // Apply theme changes (including initial load) - only after hydration
  useEffect(() => {
    if (!hasHydrated) return;

    const root = window.document.documentElement;

    // Remove all theme classes
    root.classList.remove(...themeNames);

    // Add the resolved theme class
    root.classList.add(resolvedTheme);

    // Apply CSS custom properties with fallback to light theme
    const vars = themes[resolvedTheme] || themes.light;
    Object.entries(vars).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
  }, [resolvedTheme, hasHydrated]);

  // Listen for system theme changes when using 'system' theme
  useEffect(() => {
    if (!hasHydrated || theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const systemTheme = mediaQuery.matches ? 'dark' : 'light';

      const root = window.document.documentElement;

      root.classList.remove(...themeNames);
      root.classList.add(systemTheme);

      const vars = themes[systemTheme] || themes.light;
      Object.entries(vars).forEach(([key, value]) => {
        root.style.setProperty(`--${key}`, value);
      });
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme, hasHydrated]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}