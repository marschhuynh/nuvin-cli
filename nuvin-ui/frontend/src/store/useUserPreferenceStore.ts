import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MCPConfig } from '@/types/mcp';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'ocean' | 'liquid-glass' | 'system';
  notifications: boolean;
  autoSave: boolean;
  fontSize: 'small' | 'medium' | 'large';
  messageMode: 'normal' | 'transparent';
  mcpServers: MCPConfig[];
  enabledMCPTools: Record<string, string[]>;
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
  messageMode: 'normal',
  mcpServers: [],
  enabledMCPTools: {},
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
