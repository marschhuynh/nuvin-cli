import { useCallback, useEffect, useState } from 'react';
import { Text } from 'ink';
import { AppModal } from '@/components/AppModal.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { orchestratorManager } from '@/services/OrchestratorManager.js';
import { MemoryModal, MemoryConfigModal } from '@/components/MemoryModal/index.js';
import type { MemoryEntry } from '@nuvin/nuvin-core';

const MemoryCommandComponent = ({ context, deactivate, isActive }: CommandComponentProps) => {
  const subcommand = context.rawInput.trim().split(/\s+/)[1]?.toLowerCase();
  const { theme } = useTheme();
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMemories = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const memoryService = orchestratorManager.getMemoryService();
      if (!memoryService) {
        setError('Memory is not enabled. Set memory.enabled = true in your config.');
        return;
      }
      const entries = await memoryService.getAllMemories();
      setMemories(entries);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load memories: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMemories();
  }, [loadMemories]);

  const handleDelete = useCallback(async (id: string) => {
    const memoryService = orchestratorManager.getMemoryService();
    if (!memoryService) return;

    const deleted = await memoryService.deleteMemory(id);
    if (deleted) {
      setMemories((prev) => prev.filter((m) => m.id !== id));
    }
  }, []);

  if (subcommand === 'config') {
    return <MemoryConfigModal context={context} deactivate={deactivate} isActive={isActive} />;
  }

  if (loading) {
    return (
      <AppModal visible={true} title="Memories" onClose={deactivate} closeOnEscape={true}>
        <Text color={theme.colors.warning}>Loading memories...</Text>
      </AppModal>
    );
  }

  if (error) {
    return (
      <AppModal
        visible={true}
        title="Memories"
        titleColor={theme.colors.error}
        type="error"
        onClose={deactivate}
        closeOnEscape={true}
      >
        <Text color={theme.colors.error}>{error}</Text>
      </AppModal>
    );
  }

  return (
    <MemoryModal
      visible={true}
      memories={memories}
      onClose={deactivate}
      onDelete={handleDelete}
    />
  );
};

export function registerMemoryCommand(registry: CommandRegistry): void {
  registry.register({
    id: '/memory',
    type: 'component',
    description: 'Manage long-term memory (saved + active recall). Use /memory config to set extraction model.',
    category: 'session',
    keywords: ['memory', 'memories', 'remember', 'forget', 'config'],
    component: MemoryCommandComponent,
  });
}
