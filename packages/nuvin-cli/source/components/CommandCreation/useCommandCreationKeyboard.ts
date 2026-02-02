import { useInput } from '@/contexts/InputContext/index.js';

interface UseCommandCreationKeyboardProps {
  visible: boolean;
  onCancel: () => void;
  onSave: () => void;
  onDelete?: () => void;
}

export const useCommandCreationKeyboard = ({ visible, onCancel, onSave }: UseCommandCreationKeyboardProps) => {
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

      // Tab/Shift+Tab are handled by focusCycleMiddleware, no need to emit here
    },
    { isActive: visible },
  );
};
