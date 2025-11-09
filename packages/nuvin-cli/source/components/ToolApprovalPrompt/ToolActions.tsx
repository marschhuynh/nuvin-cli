import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';

type ToolActionsProps = {
  selectedAction: number;
};

export const ToolActions: React.FC<ToolActionsProps> = ({ selectedAction }) => {
  const { theme } = useTheme();

  return (
    <Box flexDirection="row" gap={2}>
      <Box alignItems="center">
        <Text color={selectedAction === 0 ? theme.toolApproval.actionSelected : 'transparent'} bold>
          {selectedAction === 0 ? '❯ ' : '  '}
        </Text>
        <Text
          dimColor={selectedAction !== 0}
          color={selectedAction === 0 ? theme.toolApproval.actionApprove : 'white'}
          bold
        >
          Yes
        </Text>
      </Box>
      <Box alignItems="center">
        <Text color={selectedAction === 1 ? theme.toolApproval.actionSelected : 'transparent'} bold>
          {selectedAction === 1 ? '❯ ' : '  '}
        </Text>
        <Text
          dimColor={selectedAction !== 1}
          color={selectedAction === 1 ? theme.toolApproval.actionSelected : theme.toolApproval.actionDeny}
          bold
        >
          No
        </Text>
      </Box>
      <Box alignItems="center">
        <Text color={selectedAction === 2 ? theme.toolApproval.actionSelected : 'transparent'} bold>
          {selectedAction === 2 ? '❯ ' : '  '}
        </Text>
        <Text
          dimColor={selectedAction !== 2}
          color={selectedAction === 2 ? theme.toolApproval.actionSelected : theme.toolApproval.actionReview}
          bold
        >
          Yes, for this session
        </Text>
      </Box>
    </Box>
  );
};
