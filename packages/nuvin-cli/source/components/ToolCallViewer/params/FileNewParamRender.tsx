import type React from 'react';
import { Text } from 'ink';
import type { ToolParamRendererProps } from './types.js';
import { ParamLayout } from './ParamLayout.js';

const EXCLUDED_KEYS = ['content', 'description'];

export const FileNewParamRender: React.FC<ToolParamRendererProps> = ({
  args,
  statusColor,
  formatValue,
  mainArgKey,
}: ToolParamRendererProps) => {
  const entries = Object.entries(args).filter(
    ([key]) => !EXCLUDED_KEYS.includes(key) && key !== mainArgKey && key !== 'lineStart' && key !== 'lineEnd'
  );

  if (entries.length === 0) {
    return null;
  }

  return (
    <ParamLayout statusColor={statusColor}>
      {entries.map(([key, value]) => (
        <Text key={key} dimColor>{`${key}: ${formatValue(value)}`}</Text>
      ))}
    </ParamLayout>
  );
};
