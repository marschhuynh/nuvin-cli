import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { Theme } from '@/theme.js';
import { HelpText } from '../HelpText';
import { Focusable } from '../Focusable/index.js';

interface ToolSelectInputProps {
  availableTools: string[];
  selectedTools: string[];
  onChange: (nextTools: string[]) => void;
  tabIndex?: number | string;
}

export const ToolSelectInput: React.FC<ToolSelectInputProps> = ({ availableTools, selectedTools, onChange, tabIndex }) => {
  const { theme } = useTheme();
  const [highlightIndex, setHighlightIndex] = useState(0);

  return (
    <Focusable tabIndex={tabIndex}>
      {({ isFocused }) => (
        <ToolSelectInputContent
          isFocused={isFocused}
          availableTools={availableTools}
          selectedTools={selectedTools}
          onChange={onChange}
          highlightIndex={highlightIndex}
          setHighlightIndex={setHighlightIndex}
          theme={theme}
        />
      )}
    </Focusable>
  );
};

const ToolSelectInputContent: React.FC<{
  isFocused: boolean;
  availableTools: string[];
  selectedTools: string[];
  onChange: (nextTools: string[]) => void;
  highlightIndex: number;
  setHighlightIndex: React.Dispatch<React.SetStateAction<number>>;
  theme: Theme;
}> = ({ isFocused, availableTools, selectedTools, onChange, highlightIndex, setHighlightIndex, theme }) => {

  const combinedTools = useMemo(() => {
    const ordered = [...availableTools];
    for (const tool of selectedTools) {
      if (!ordered.includes(tool)) {
        ordered.push(tool);
      }
    }
    return ordered;
  }, [availableTools, selectedTools]);

  useEffect(() => {
    if (!isFocused) {
      return;
    }
    setHighlightIndex(0);
  }, [isFocused, setHighlightIndex]);

  useEffect(() => {
    setHighlightIndex((current) => {
      if (combinedTools.length === 0) {
        return 0;
      }
      return Math.min(current, combinedTools.length - 1);
    });
  }, [combinedTools, setHighlightIndex]);

  const toggleTool = useCallback(
    (toolName: string) => {
      if (selectedTools.includes(toolName)) {
        onChange(selectedTools.filter((name) => name !== toolName));
        return;
      }
      onChange([...selectedTools, toolName]);
    },
    [onChange, selectedTools],
  );

  useInput(
    (input, key) => {
      if (key.upArrow || key.leftArrow) {
        setHighlightIndex((prev) => (prev <= 0 ? combinedTools.length - 1 : prev - 1));
        return true;
      }

      if (key.downArrow || key.rightArrow) {
        setHighlightIndex((prev) => (prev >= combinedTools.length - 1 ? 0 : prev + 1));
        return true;
      }

      if (input === ' ') {
        toggleTool(combinedTools[highlightIndex]);
        return true;
      }
    },
    { isActive: isFocused },
  );

  if (combinedTools.length === 0) {
    return (
      <Box>
        <Text color={theme.modal.help} dimColor>
          No tools available
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text>
        <Text color={isFocused ? theme.colors.accent : theme.modal.help} bold={isFocused} dimColor={!isFocused}>Tools: </Text>
        <Text color={theme.tokens.dim}>
          (
          <HelpText
            segments={[
              { text: '←/→', },
              { text: ' cycle fields • ' },
              { text: 'Space', },
              { text: ' toggle • ' },
              { text: 'Tab', },
              { text: ' continue' },
            ]}
          />
          )
        </Text>
      </Text>
      <Box flexDirection="row" alignItems="center" paddingX={1} flexWrap="wrap">
        {combinedTools.map((toolName, index) => {
          const isHighlighted = isFocused && index === highlightIndex;
          const isSelected = selectedTools.includes(toolName);
          return (
            <Box key={toolName} marginRight={1}>
              <Text
                color={isHighlighted ? theme.colors.primary : isSelected ? theme.colors.accent : theme.modal.help}
                bold={isHighlighted}
                dimColor={!isHighlighted && !isSelected}
              >
                {isSelected ? '●' : '○'} {toolName}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
