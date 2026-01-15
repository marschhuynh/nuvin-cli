import { useInput } from '@/contexts/InputContext/index.js';
import { eventBus } from '@/services/EventBus.js';

interface UseCommandCreationKeyboardProps {
  visible: boolean;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

export const useCommandCreationKeyboard = ({
  visible,
  onCancel,
  onSave,
}: UseCommandCreationKeyboardProps) => {
  useInput(
    (input, key) => {
      if (!visible) return;

      if (key.escape) {
        onCancel();
        return;
      }

      if (key.ctrl && input === 's') {
        onSave();
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
