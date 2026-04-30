import type React from 'react';
import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext';
import { useFocus } from '@/contexts/InputContext/FocusContext.js';
import { useTheme } from '@/contexts/ThemeContext.js';

type ToolActionsProps = {
  onActionExecute: (action: number) => void;
};

type ActionButtonProps = {
  label: string;
  labelSelectedColor: string;
  labelDefaultColor: string;
  onActionExecute: () => void;
  autoFocus?: boolean;
};

const ActionButton: React.FC<ActionButtonProps> = ({
  label,
  labelSelectedColor,
  labelDefaultColor,
  onActionExecute,
  autoFocus,
}) => {
  const { theme } = useTheme();
  const { isFocused } = useFocus({ active: true, autoFocus });

  useInput(
    (_input, key) => {
      if (key.return) {
        onActionExecute();
        return true;
      }
    },
    { isActive: isFocused },
  );

  return (
    <Box alignItems="center">
      <Text color={isFocused ? theme.toolApproval.actionSelected : undefined} bold>
        {isFocused ? '❯ ' : '  '}
      </Text>
      <Text dimColor={!isFocused} color={isFocused ? labelSelectedColor : labelDefaultColor} bold>
        {label}
      </Text>
    </Box>
  );
};

export const ToolActions: React.FC<ToolActionsProps> = ({ onActionExecute }) => {
  const { theme } = useTheme();

  return (
    <Box flexDirection="row" gap={2}>
      <ActionButton
        label="Yes"
        labelSelectedColor={theme.toolApproval.actionApprove}
        labelDefaultColor="white"
        onActionExecute={() => onActionExecute(0)}
        autoFocus
      />
      <ActionButton
        label="No"
        labelSelectedColor={theme.toolApproval.actionSelected}
        labelDefaultColor={theme.toolApproval.actionDeny}
        onActionExecute={() => onActionExecute(1)}
      />
      <ActionButton
        label="Yes, for this session"
        labelSelectedColor={theme.toolApproval.actionSelected}
        labelDefaultColor={theme.toolApproval.actionReview}
        onActionExecute={() => onActionExecute(2)}
      />
    </Box>
  );
};
