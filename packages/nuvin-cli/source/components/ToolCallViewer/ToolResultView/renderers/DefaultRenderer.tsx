import type React from 'react';
import type { ToolExecutionResult } from '@nuvin/nuvin-core';
import { BaseRenderer } from './BaseRenderer.js';
import { TRUNCATION } from './constants.js';

type DefaultRendererProps = {
  toolResult: ToolExecutionResult;
  messageId?: string;
  messageContent?: string;
  messageColor?: string;
  fullMode?: boolean;
  cols: number;
};

export const DefaultRenderer: React.FC<DefaultRendererProps> = (props) => (
  <BaseRenderer
    {...props}
    maxLines={TRUNCATION.DEFAULT_MAX_LINES}
    maxLineLength={TRUNCATION.DEFAULT_MAX_LINE_LENGTH}
    truncationMode="head"
  />
);
