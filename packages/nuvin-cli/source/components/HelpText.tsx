import type React from 'react';
import { Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';

interface HelpTextSegment {
  text: string;
  highlight?: boolean;
}

interface HelpTextProps {
  segments: HelpTextSegment[];
}

export const HelpText: React.FC<HelpTextProps> = ({ segments }) => {
  const { theme } = useTheme();

  return (
    <>
      {segments.map((segment, index) => (
        <Text
          key={`segment-${index}-${segment.text.slice(0, 10)}`}
          color={segment.highlight ? theme.colors.accent : theme.tokens.dim}
          dimColor={!segment.highlight}
          bold={segment.highlight}
        >
          {segment.text}
        </Text>
      ))}
    </>
  );
};
