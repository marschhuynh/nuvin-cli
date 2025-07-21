import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface MCPConfig {
  id: string;
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled: boolean;
  description?: string;
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'ocean' | 'liquid-glass' | 'system';
  notifications: boolean;
  autoSave: boolean;
  fontSize: 'small' | 'medium' | 'large';
  mcpServers: MCPConfig[];
}

interface UserPreferenceState {
  preferences: UserPreferences;
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  reset: () => void;
  // Track hydration state
  hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

const defaultPreferences: UserPreferences = {
  theme: 'system',
  notifications: true,
  autoSave: true,
  fontSize: 'medium',
  mcpServers: [],
};

export const useUserPreferenceStore = create<UserPreferenceState>()(
  persist(
    (set) => ({
      preferences: defaultPreferences,
      updatePreferences: (updates) =>
        set((state) => ({
          preferences: { ...state.preferences, ...updates },
        })),
      reset: () => set({ preferences: defaultPreferences }),
      hasHydrated: false,
      setHasHydrated: (state) => set({ hasHydrated: state }),
    }),
    {
      name: 'user-preferences-storage',
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    },
  ),
);
