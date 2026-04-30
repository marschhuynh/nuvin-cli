import type React from 'react';
import { createContext, useContext, useMemo } from 'react';
import { commandRegistry } from './registry.js';

interface CommandContextValue {
  registry: typeof commandRegistry;
}

const CommandContext = createContext<CommandContextValue | undefined>(undefined);

export function CommandProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => ({ registry: commandRegistry }), []);

  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>;
}

export function useCommandContext() {
  const context = useContext(CommandContext);
  if (!context) {
    throw new Error('useCommandContext must be used within CommandProvider');
  }
  return context;
}
