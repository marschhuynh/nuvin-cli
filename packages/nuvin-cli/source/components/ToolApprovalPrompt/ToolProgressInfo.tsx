import type React from 'react';
import { Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';

type ToolProgressInfoProps = {
  currentIndex: number;
  totalTools: number;
};

export const ToolProgressInfo: React.FC<ToolProgressInfoProps> = ({ currentIndex, totalTools }) => {
  const { theme } = useTheme();

  return (
    <Text color={theme.toolApproval.statusText}>
      {currentIndex + 1}/{totalTools}
    </Text>
  );
};
