import { forwardRef, useImperativeHandle } from 'react';
import { Box, Text } from 'ink';
import { useInput, useFocus } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { UncontrolledTextInput } from '../TextInput';

export interface ToolEditInputHandle {
  focus: () => void;
}

type ToolEditInputProps = {
  onSubmit: (value: string) => void;
  onCancel: () => void;
};

export const ToolEditInput = forwardRef<ToolEditInputHandle, ToolEditInputProps>(
  ({ onSubmit, onCancel }, ref) => {
    const { theme } = useTheme();
    const { isFocused, focus } = useFocus();

    useImperativeHandle(ref, () => ({ focus }), [focus]);

    useInput(
      (_input, key) => {
        if (key.escape) {
          onCancel();
          return true;
        }
        return false;
      },
      { isActive: isFocused },
    );

    return (
      <Box flexDirection="row" alignItems="flex-start">
        <Text color={isFocused ? theme.toolApproval.actionSelected : theme.toolApproval.description} bold={isFocused}>
          {isFocused ? '❯ ' : '│ '}
        </Text>
        <Box flexGrow={1}>
          <UncontrolledTextInput
            focus={isFocused}
            placeholder="Input your changes here"
            onSubmit={onSubmit}
          />
        </Box>
      </Box>
    );
  },
);

ToolEditInput.displayName = 'ToolEditInput';
