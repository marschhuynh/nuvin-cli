import type React from 'react';
import type { ToolCall } from '@nuvin/nuvin-core';
import { useStdoutDimensions } from '@/hooks/index.js';
import { AutoScrollBox } from '@/components/AutoScrollBox.js';
import { ToolRenderer } from './tool-renderers.js';

type ToolParametersProps = {
  toolCall: ToolCall;
};

export const ToolParameters: React.FC<ToolParametersProps> = ({ toolCall }) => {
  const { rows } = useStdoutDimensions();
  const maxHeight = Math.max(5, rows - 16);

  return (
    <AutoScrollBox maxHeight={maxHeight} mousePriority={100} flexGrow={1}>
      <ToolRenderer toolCall={toolCall} />
    </AutoScrollBox>
  );
};
