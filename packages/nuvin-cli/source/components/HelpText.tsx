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
      {segments.map((segment) => (
        <Text key={segment.text} color={segment.highlight ? 'white' : theme.history.help} dimColor={!segment.highlight}>
          {segment.text}
        </Text>
      ))}
    </>
  );
};
