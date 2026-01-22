import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import { AppModal } from '@/components/AppModal.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

const MODAL_HEIGHT = 30;

interface AgentLoadingProps {
  mode: 'create' | 'edit';
}

export const AgentLoading: React.FC<AgentLoadingProps> = ({ mode }) => {
  const { rows } = useStdoutDimensions();
  const { theme } = useTheme();

  const loadingTitle = mode === 'edit' ? 'Updating Agent…' : 'Creating Agent…';
  const loadingMessage = mode === 'edit' ? 'Saving updated configuration…' : 'Generating agent configuration with LLM…';
  const loadingColor = mode === 'edit' ? theme.colors.primary : theme.colors.warning;

  return (
    <AppModal visible={true} title={loadingTitle} height={Math.min(MODAL_HEIGHT, rows - 4)}>
      <Box marginY={1}>
        <Text color={loadingColor}>{loadingMessage}</Text>
      </Box>
    </AppModal>
  );
};
