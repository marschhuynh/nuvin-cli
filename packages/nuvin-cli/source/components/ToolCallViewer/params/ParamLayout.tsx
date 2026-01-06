import type React from 'react';
import { Box } from 'ink';
import { useStdoutDimensions } from '@/hooks/index.js';
import { LAYOUT } from '@/components/ToolCallViewer/ToolResultView/renderers/constants';

type ParamLayoutProps = {
  statusColor: string;
  children: React.ReactNode;
};

export const ParamLayout: React.FC<ParamLayoutProps> = ({ statusColor, children }) => {
  const { cols } = useStdoutDimensions();

  if (!children) return null;

  return (
    <Box
      flexDirection="column"
      marginLeft={2}
      borderStyle="single"
      borderDimColor
      borderColor={statusColor}
      borderBottom={false}
      borderRight={false}
      borderTop={false}
      paddingLeft={2}
      width={cols - LAYOUT.PARAM_MARGIN}
    >
      {children}
    </Box>
  );
};
