import type React from 'react';
import type { CommandSource, CustomCommandTemplate } from '@nuvin/nuvin-core';
import { CommandForm } from './CommandForm.js';
import { useCommandCreationState } from './useCommandCreationState.js';
import { useCommandCreationKeyboard } from './useCommandCreationKeyboard.js';

interface CommandCreationProps {
  visible: boolean;
  mode: 'create' | 'edit';
  initialCommand?: Partial<CustomCommandTemplate>;
  availableScopes: CommandSource[];
  activeProfile?: string;
  onSave: (command: CustomCommandTemplate) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

export const CommandCreation: React.FC<CommandCreationProps> = ({
  visible,
  mode,
  initialCommand,
  availableScopes,
  activeProfile,
  onSave,
  onCancel,
  onDelete,
}) => {
  const state = useCommandCreationState({
    mode,
    initialCommand,
    availableScopes,
  });

  const handleSave = () => {
    if (state.validate()) {
      onSave(state.getCommand());
    }
  };

  useCommandCreationKeyboard({
    visible,
    onCancel,
    onSave: handleSave,
    onDelete: mode === 'edit' ? onDelete : undefined,
  });

  if (!visible) return null;

  return (
    <CommandForm
      mode={mode}
      command={initialCommand || {}}
      availableScopes={availableScopes}
      activeProfile={activeProfile}
      editedName={state.editedName}
      editedDescription={state.editedDescription}
      editedScope={state.editedScope}
      editedPrompt={state.editedPrompt}
      error={state.error}
      onFieldChange={state.handleFieldChange}
      onScopeChange={state.handleScopeChange}
      onDelete={mode === 'edit' ? onDelete : undefined}
    />
  );
};

export default CommandCreation;
