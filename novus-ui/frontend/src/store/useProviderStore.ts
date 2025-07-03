import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { ProviderConfig } from '@/types'

interface ProviderState {
  providers: ProviderConfig[]
  addProvider: (provider: ProviderConfig) => void
  updateProvider: (provider: ProviderConfig) => void
  deleteProvider: (id: string) => void
  reset: () => void
}

const defaultProviders: ProviderConfig[] = [
  { id: 'default', name: 'OpenAI', apiKey: '' }
]

export const useProviderStore = create<ProviderState>()(
  persist(
    (set) => ({
      providers: defaultProviders,
      addProvider: (provider) =>
        set((state) => ({ providers: [...state.providers, provider] })),
      updateProvider: (provider) =>
        set((state) => ({
          providers: state.providers.map((p) =>
            p.id === provider.id ? provider : p
          )
        })),
      deleteProvider: (id) =>
        set((state) => ({
          providers: state.providers.filter((p) => p.id !== id)
        })),
      reset: () => set({ providers: defaultProviders })
    }),
    {
      name: 'provider-storage'
    }
  )
)
