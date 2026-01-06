import type React from 'react';
import type { ToolExecutionResult } from '@nuvin/nuvin-core';
import { BaseRenderer } from './BaseRenderer.js';
import { TRUNCATION } from './constants.js';

type BashToolRendererProps = {
  toolResult: ToolExecutionResult;
  messageId?: string;
  messageContent?: string;
  messageColor?: string;
  fullMode?: boolean;
  cols: number;
};

export const BashToolRenderer: React.FC<BashToolRendererProps> = (props) => (
  <BaseRenderer
    {...props}
    maxLines={TRUNCATION.BASH_MAX_LINES}
    maxLineLength={TRUNCATION.BASH_MAX_LINE_LENGTH}
    truncationMode="tail"
  />
);
