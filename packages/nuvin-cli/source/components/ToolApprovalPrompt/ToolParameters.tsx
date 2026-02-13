import React from 'react';
import type { ToolCall } from '@nuvin/nuvin-core';
import { useStdoutDimensions } from '@/hooks/index.js';
import { AutoScrollBox } from '@/components/AutoScrollBox.js';
import { ToolRenderer } from './tool-renderers.js';

type ToolParametersProps = {
  toolCall: ToolCall;
};

const ToolParametersInner: React.FC<ToolParametersProps> = ({ toolCall }) => {
  const { rows } = useStdoutDimensions();
  // Reserve space for: title bar (1) + margin (1) + actions (1) + margin (1) + edit input (1) + margin (1) + footer (1) + app footer (2) + buffer (2)
  const maxHeight = Math.max(5, rows - 12);

  return (
    <AutoScrollBox
      maxHeight={maxHeight}
      mousePriority={100}
      flexGrow={1}
      flexShrink={1}
      width="100%"
      enableMouseScroll={false}
      autoFocus
    >
      <ToolRenderer toolCall={toolCall} />
    </AutoScrollBox>
  );
};

export const ToolParameters = React.memo(ToolParametersInner);
