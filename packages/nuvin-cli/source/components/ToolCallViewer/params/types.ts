import type React from 'react';
import type { ToolCall } from '@nuvin/nuvin-core';

export type ToolParamRendererProps = {
  toolCall: ToolCall;
  args: Record<string, unknown>;
  statusColor: string;
  formatValue: (value: unknown) => string;
};

export type ToolParamRendererComponent = React.FC<ToolParamRendererProps>;
