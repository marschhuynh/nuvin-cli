import { useInput } from '@/contexts/InputContext/index.js';
import { eventBus } from '@/services/EventBus.js';
import type { CommandCreationState, CommandCreationActions } from './useCommandCreationState.js';

interface UseCommandCreationKeyboardProps {
  visible: boolean;
  state: CommandCreationState;
  actions: CommandCreationActions;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

export const useCommandCreationKeyboard = ({
  visible,
  state,
  actions,
  onCancel,
  onSave,
  onDelete,
}: UseCommandCreationKeyboardProps) => {
  useInput(
    (input, key) => {
      if (!visible) return;

      if (key.escape) {
        if (state.formView === 'prompt') {
          actions.navigateToBasic();
          return;
        }
        onCancel();
        return;
      }

      if (key.ctrl && input === 's') {
        onSave();
        return;
      }

      if (key.ctrl && input === 'p') {
        if (state.formView === 'basic') {
          actions.navigateToPrompt();
        } else {
          actions.navigateToBasic();
        }
        return;
      }

      if (key.return && state.formView === 'basic' && onDelete) {
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
    },
    { isActive: visible },
  );
};
