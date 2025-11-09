import { useEffect, type ReactNode } from 'react';
import { useConfig } from '@/contexts/ConfigContext.js';
import { commandRegistry } from '@/modules/commands/registry.js';

interface ConfigBridgeProps {
  children: ReactNode;
}

export function ConfigBridge({ children }: ConfigBridgeProps) {
  const { get, set, delete: deleteKey } = useConfig();

  useEffect(() => {
    // Set up the config functions for the command registry
    commandRegistry.setConfigFunctions({ get, set, delete: deleteKey });
  }, [get, set, deleteKey]);

  return <>{children}</>;
}
