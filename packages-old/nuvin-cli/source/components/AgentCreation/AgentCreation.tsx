import type React from 'react';
import type { AgentTemplate } from '@nuvin/nuvin-core';
import { useAgentCreationState } from './useAgentCreationState.js';
import { useAgentCreationKeyboard } from './useAgentCreationKeyboard.js';
import { AgentDescriptionInput } from './AgentDescriptionInput.js';
import { AgentPreview } from './AgentPreview.js';
import { AgentBasicForm } from './AgentBasicForm.js';
import { AgentInstructionsForm } from './AgentInstructionsForm.js';
import { AgentLoading } from './AgentLoading.js';
import { AgentError } from './AgentError.js';

interface AgentCreationProps {
  visible: boolean;
  onGenerate: (description: string) => void;
  onCancel: () => void;
  onConfirm?: (nextPreview?: Partial<AgentTemplate> & { instructions: string }) => void;
  onEditPreview?: () => void;
  onUpdatePreview?: (nextPreview: Partial<AgentTemplate> & { instructions: string }) => void;
  onDelete?: () => void;
  availableTools?: string[];
  loading?: boolean;
  error?: string;
  preview?: Partial<AgentTemplate> & { instructions: string };
  mode?: 'create' | 'edit';
  isDefault?: boolean;
  navigationSource?: 'agent-config' | 'direct';
}

export const AgentCreation: React.FC<AgentCreationProps> = ({
  visible,
  onGenerate,
  onCancel,
  onConfirm,
  onUpdatePreview,
  onDelete,
  availableTools = [],
  loading = false,
  error,
  preview,
  mode = 'create',
  isDefault = false,
}) => {
  const state = useAgentCreationState(mode, preview, onUpdatePreview, onConfirm);

  useAgentCreationKeyboard({
    visible,
    state,
    actions: state,
    onCancel,
    onConfirm,
    onDelete: mode === 'edit' && !isDefault ? onDelete : undefined,
    loading,
  });

  if (!visible) return null;

  if (loading) {
    return <AgentLoading mode={mode} />;
  }

  if (mode === 'create' && error) {
    return <AgentError error={error} />;
  }

  if (state.isEditing && preview) {
    if (state.editFormView === 'instructions') {
      return (
        <AgentInstructionsForm
          mode={mode}
          preview={preview}
          editedInstructions={state.editedInstructions}
          error={error}
          onInstructionsChange={state.setEditedInstructions}
          onNavigateBack={state.navigateToBasicForm}
        />
      );
    }

    return (
      <AgentBasicForm
        mode={mode}
        preview={preview}
        availableTools={availableTools}
        editedName={state.editedName}
        editedDescription={state.editedDescription}
        editedAllowedTools={state.editedAllowedTools}
        editedTemperature={state.editedTemperature}
        editedMaxTokens={state.editedMaxTokens}
        editedModel={state.editedModel}
        error={error}
        isDefault={isDefault}
        onFieldChange={(field, value) => {
          switch (field) {
            case 'name':
              state.setEditedName(value);
              break;
            case 'model':
              state.setEditedModel(value);
              break;
            case 'temperature':
              state.setEditedTemperature(value);
              break;
            case 'max_tokens':
              state.setEditedMaxTokens(value);
              break;
            case 'description':
              state.setEditedDescription(value);
              break;
          }
        }}
        onToolsChange={state.setEditedAllowedTools}
        onNavigateToInstructions={state.navigateToInstructions}
        onDelete={onDelete}
      />
    );
  }

  if (mode === 'create' && state.showPreview && preview) {
    return (
      <AgentPreview
        preview={preview}
        onSave={() => {
          onConfirm?.();
          state.setDescription('');
          state.setShowPreview(false);
        }}
        onEdit={() => {
          state.handleStartEditing();
        }}
      />
    );
  }

  if (mode === 'edit' && preview) {
    return (
      <AgentBasicForm
        mode={mode}
        preview={preview}
        availableTools={availableTools}
        editedName={state.editedName}
        editedDescription={state.editedDescription}
        editedAllowedTools={state.editedAllowedTools}
        editedTemperature={state.editedTemperature}
        editedMaxTokens={state.editedMaxTokens}
        editedModel={state.editedModel}
        error={error}
        isDefault={isDefault}
        onFieldChange={(field, value) => {
          switch (field) {
            case 'name':
              state.setEditedName(value);
              break;
            case 'model':
              state.setEditedModel(value);
              break;
            case 'temperature':
              state.setEditedTemperature(value);
              break;
            case 'max_tokens':
              state.setEditedMaxTokens(value);
              break;
            case 'description':
              state.setEditedDescription(value);
              break;
          }
        }}
        onToolsChange={state.setEditedAllowedTools}
        onNavigateToInstructions={state.navigateToInstructions}
        onDelete={onDelete}
      />
    );
  }

  return (
    <AgentDescriptionInput
      description={state.description}
      onChange={state.setDescription}
      onSubmit={() => {
        if (state.description.trim()) {
          onGenerate(state.description);
        }
      }}
    />
  );
};

export default AgentCreation;
