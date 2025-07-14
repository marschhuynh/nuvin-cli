import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface UserPreferences {
  theme: 'light' | 'dark' | 'ocean' | 'system';
  notifications: boolean;
  autoSave: boolean;
  fontSize: 'small' | 'medium' | 'large';
}

interface UserPreferenceState {
  preferences: UserPreferences;
  updatePreferences: (preferences: Partial<UserPreferences>) => void;
  reset: () => void;
}

const defaultPreferences: UserPreferences = {
  theme: 'system',
  notifications: true,
  autoSave: true,
  fontSize: 'medium',
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
    }),
    {
      name: 'user-preferences-storage',
    },
  ),
);
