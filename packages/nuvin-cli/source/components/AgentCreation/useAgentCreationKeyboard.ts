import { useInput } from '@/contexts/InputContext/index.js';
import { eventBus } from '@/services/EventBus.js';
import type { AgentCreationState, AgentCreationActions } from './useAgentCreationState.js';
import type { AgentTemplate } from '@nuvin/nuvin-core';

interface UseAgentCreationKeyboardProps {
  visible: boolean;
  state: AgentCreationState;
  actions: AgentCreationActions;
  onCancel: () => void;
  onConfirm?: (nextPreview?: Partial<AgentTemplate> & { systemPrompt: string }) => void;
  loading?: boolean;
}

export const useAgentCreationKeyboard = ({
  visible,
  state,
  actions,
  onCancel,
  onConfirm,
  loading = false,
}: UseAgentCreationKeyboardProps) => {
  useInput(
    (input, key) => {
      if (!visible || loading) return;

      if (key.escape) {
        if (state.isEditing) {
          if (state.editFormView === 'systemPrompt') {
            actions.navigateToBasicForm();
            return;
          }
          if (state.mode === 'edit') {
            onCancel();
            return;
          }
          actions.handleCancelEditing();
          return;
        }

        if (state.mode === 'create' && state.showPreview) {
          actions.setShowPreview(false);
          return;
        }

        onCancel();
        actions.setDescription('');
        actions.setShowPreview(false);
        return;
      }

      if (state.isEditing || state.showPreview) {
        if (key.ctrl && input === 's') {
          actions.handleSaveEditing();
          onConfirm?.(actions.getUpdatedPreview());
          return;
        }

        if (key.ctrl && input === 'p') {
          if (state.editFormView === 'basic') {
            actions.navigateToSystemPrompt();
          } else {
            actions.navigateToBasicForm();
          }
          return;
        }

        if (key.tab && !key.shift) {
          eventBus.emit('ui:focus:cycle', 'forward');
          return;
        }

        if (key.tab && key.shift) {
          eventBus.emit('ui:focus:cycle', 'backward');
          return;
        }
      }
    },
    { isActive: visible },
  );
};
