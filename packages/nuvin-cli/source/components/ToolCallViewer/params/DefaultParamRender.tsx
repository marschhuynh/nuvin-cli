import type React from 'react';
import { Text } from 'ink';
import type { ToolParamRendererProps } from './types.js';
import { ParamLayout } from './ParamLayout.js';

export const DefaultParamRender: React.FC<ToolParamRendererProps> = ({
  args,
  statusColor,
  formatValue,
  mainArgKey,
}: ToolParamRendererProps) => {
  const entries = Object.entries(args).filter(
    ([key]) => key !== 'description' && key !== mainArgKey && key !== 'lineStart' && key !== 'lineEnd'
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
