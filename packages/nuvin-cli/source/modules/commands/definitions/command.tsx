import { useCallback, useEffect, useState } from 'react';
import * as path from 'node:path';
import * as os from 'node:os';
import { Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import type { CompleteCustomCommand, CustomCommandTemplate, CommandSource } from '@nuvin/nuvin-core';
import { AppModal } from '@/components/AppModal.js';
import CommandModal from '@/components/CommandModal/CommandModal.js';
import CommandCreation from '@/components/CommandCreation/CommandCreation.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { CustomCommandRegistry } from '@/services/CustomCommandRegistry.js';
import { ConfigManager } from '@/config/manager.js';
import { DEFAULT_PROFILE } from '@/config/profile-types.js';
import { eventBus } from '@/services/EventBus.js';
import { reloadCustomCommands } from '@/services/CustomCommandLoader.js';
import { commandRegistry } from '@/modules/commands/registry.js';

type ActiveView = 'list' | 'create' | 'edit';

interface NavigationState {
  activeView: ActiveView;
  editingCommandId: string | null;
  selectedIndex: number;
}

const CommandCommandComponent = ({ deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const [commands, setCommands] = useState<CompleteCustomCommand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registry, setRegistry] = useState<CustomCommandRegistry | null>(null);
  const [activeProfile, setActiveProfile] = useState<string | undefined>();
  const [availableScopes, setAvailableScopes] = useState<CommandSource[]>(['global', 'local']);

  const [navState, setNavState] = useState<NavigationState>({
    activeView: 'list',
    editingCommandId: null,
    selectedIndex: 0,
  });

  useInput(
    (_input, key) => {
      if (key.escape && navState.activeView === 'list') {
        deactivate();
      }
    },
    { isActive: navState.activeView === 'list' },
  );

  const loadCommands = useCallback(async (reg: CustomCommandRegistry) => {
    try {
      setLoading(true);
      setError(null);
      await reg.reload();
      const loadedCommands = reg.list({ includeHidden: true });
      setCommands(loadedCommands);
      setAvailableScopes(reg.getAvailableScopes());
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(`Failed to load commands: ${message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initRegistry = async () => {
      try {
        const configManager = ConfigManager.getInstance();
        const globalDir = configManager.globalDir || path.join(os.homedir(), '.nuvin');
        const localDir = configManager.localDir || path.join(process.cwd(), '.nuvin');

        const profile = configManager.getCurrentProfile();
        const profileManager = configManager.getProfileManager();

        let profileDir: string | undefined;
        if (profile && profile !== DEFAULT_PROFILE && profileManager) {
          profileDir = profileManager.getProfileCommandsDir(profile);
        }

        setActiveProfile(profile !== DEFAULT_PROFILE ? profile : undefined);

        const reg = new CustomCommandRegistry({
          globalDir,
          profileDir,
          localDir,
          activeProfile: profile,
        });

        await reg.initialize();
        setRegistry(reg);
        await loadCommands(reg);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setError(`Failed to initialize: ${message}`);
        setLoading(false);
      }
    };

    void initRegistry();
  }, [loadCommands]);

  const handleCreate = useCallback(() => {
    setNavState({
      activeView: 'create',
      editingCommandId: null,
      selectedIndex: navState.selectedIndex,
    });
  }, [navState.selectedIndex]);

  const handleEdit = useCallback(
    (commandId: string) => {
      setNavState({
        activeView: 'edit',
        editingCommandId: commandId,
        selectedIndex: navState.selectedIndex,
      });
    },
    [navState.selectedIndex],
  );

  const handleDelete = useCallback(
    async (commandId: string) => {
      if (!registry) return;

      try {
        const command = registry.get(commandId);
        if (!command) return;

        await registry.deleteFromFile(commandId, command.source);

        const updatedCommands = registry.list({ includeHidden: true });
        setCommands(updatedCommands);

        const newSelectedIndex = Math.min(navState.selectedIndex, Math.max(0, updatedCommands.length - 1));

        setNavState({
          activeView: 'list',
          editingCommandId: null,
          selectedIndex: newSelectedIndex,
        });

        await reloadCustomCommands(commandRegistry);
        eventBus.emit('ui:commands:refresh');
      } catch (err) {
        setError(`Failed to delete command: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [registry, navState.selectedIndex],
  );

  const handleSave = useCallback(
    async (command: CustomCommandTemplate, originalCommandId?: string, originalSource?: CommandSource) => {
      if (!registry) return;

      try {
        // If editing and ID or source changed, delete the old command first
        const idChanged = originalCommandId && originalCommandId !== command.id;
        const sourceChanged = originalSource && originalSource !== command.source;

        if (originalCommandId && (idChanged || sourceChanged)) {
          await registry.deleteFromFile(originalCommandId, originalSource || command.source);
        }

        await registry.saveToFile({
          ...command,
          enabled: true,
          filePath: registry.getCommandFilePath(command.id, command.source),
        });

        const updatedCommands = registry.list({ includeHidden: true });
        setCommands(updatedCommands);

        const newIndex = updatedCommands.findIndex((c) => c.id === command.id);

        setNavState({
          activeView: 'list',
          editingCommandId: null,
          selectedIndex: newIndex >= 0 ? newIndex : 0,
        });

        await reloadCustomCommands(commandRegistry);
        eventBus.emit('ui:commands:refresh');
      } catch (err) {
        setError(`Failed to save command: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [registry],
  );

  const handleCancel = useCallback(() => {
    setNavState((prev) => ({
      ...prev,
      activeView: 'list',
      editingCommandId: null,
    }));
  }, []);

  const getShadowedCommands = useCallback(
    (commandId: string): CompleteCustomCommand[] => {
      if (!registry) return [];
      return registry.getShadowed(commandId);
    },
    [registry],
  );

  if (navState.activeView === 'create') {
    return (
      <CommandCreation
        visible={true}
        mode="create"
        availableScopes={availableScopes}
        activeProfile={activeProfile}
        onSave={(command) => handleSave(command)}
        onCancel={handleCancel}
      />
    );
  }

  if (navState.activeView === 'edit' && navState.editingCommandId) {
    const editingCommand = registry?.get(navState.editingCommandId);
    const originalCommandId = navState.editingCommandId;
    const originalSource = editingCommand?.source;
    return (
      <CommandCreation
        visible={true}
        mode="edit"
        initialCommand={editingCommand}
        availableScopes={availableScopes}
        activeProfile={activeProfile}
        onSave={(command) => handleSave(command, originalCommandId, originalSource)}
        onCancel={handleCancel}
        onDelete={() => handleDelete(originalCommandId)}
      />
    );
  }

  if (loading) {
    return (
      <AppModal visible={true} title="Custom Commands" onClose={deactivate} closeOnEscape={true}>
        <Text color={theme.colors.warning}>Loading commands...</Text>
      </AppModal>
    );
  }

  if (error) {
    return (
      <AppModal
        visible={true}
        title="Custom Commands"
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
    <CommandModal
      visible={true}
      commands={commands}
      activeProfile={activeProfile}
      initialSelectedIndex={navState.selectedIndex}
      onClose={deactivate}
      onCreate={handleCreate}
      onEdit={handleEdit}
      onDelete={handleDelete}
      getShadowedCommands={getShadowedCommands}
    />
  );
};

export function registerCommandCommand(registry: CommandRegistry) {
  registry.register({
    id: '/command',
    type: 'component',
    description: 'Manage custom commands (create, edit, delete).',
    category: 'config',
    component: CommandCommandComponent,
  });
}
