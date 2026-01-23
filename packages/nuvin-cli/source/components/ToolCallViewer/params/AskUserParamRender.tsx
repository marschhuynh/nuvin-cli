import type React from 'react';
import type { ToolParamRendererProps } from './types.js';

export const AskUserParamRender: React.FC<ToolParamRendererProps> = () => {
  // Question count is shown in the tool name, so no need to show params
  return null;
};
