import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ProviderConfig } from '@/types'

interface ProviderState {
  providers: ProviderConfig[]
  activeProviderId: string
  addProvider: (provider: ProviderConfig) => void
  updateProvider: (provider: ProviderConfig) => void
  deleteProvider: (id: string) => void
  setActiveProvider: (id: string) => void
  isNameUnique: (name: string, excludeId?: string) => boolean
  reset: () => void
}

const defaultProviders: ProviderConfig[] = [
  { id: 'default', name: 'Default OpenAI', type: 'OpenAI', apiKey: '' }
]

export const useProviderStore = create<ProviderState>()(
  persist(
    (set, get) => ({
      providers: defaultProviders,
      activeProviderId: 'default',
      addProvider: (provider) =>
        set((state) => ({ providers: [...state.providers, provider] })),
      updateProvider: (provider) =>
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === provider.id ? provider : p
          )
        })),
      deleteProvider: (id) =>
        set((state) => {
          const newProviders = state.providers.filter((p) => p.id !== id);
          const newActiveId = state.activeProviderId === id
            ? (newProviders.length > 0 ? newProviders[0].id : '')
            : state.activeProviderId;
          return {
            providers: newProviders,
            activeProviderId: newActiveId
          };
        }),
      setActiveProvider: (id) =>
        set({ activeProviderId: id }),
      isNameUnique: (name, excludeId) => {
        const providers = get().providers;
        return !providers.some(p => p.name === name && p.id !== excludeId);
      },
      reset: () => set({ providers: defaultProviders, activeProviderId: 'default' })
    }),
    {
      name: 'provider-storage'
    }
  )
)
