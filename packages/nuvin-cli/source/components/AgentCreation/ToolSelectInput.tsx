import type React from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';

interface ToolSelectInputProps {
  focus: boolean;
  availableTools: string[];
  selectedTools: string[];
  onChange: (nextTools: string[]) => void;
  onSubmit?: () => void;
}

export const ToolSelectInput: React.FC<ToolSelectInputProps> = ({
  focus,
  availableTools,
  selectedTools,
  onChange,
  onSubmit,
}) => {
  const { theme } = useTheme();
  const [highlightIndex, setHighlightIndex] = useState(0);

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
    if (!focus) {
      return;
    }
    setHighlightIndex(0);
  }, [focus]);

  useEffect(() => {
    setHighlightIndex((current) => {
      if (combinedTools.length === 0) {
        return 0;
      }
      return Math.min(current, combinedTools.length - 1);
    });
  }, [combinedTools]);

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
      if (!focus || combinedTools.length === 0) {
        return;
      }

      if (key.upArrow) {
        setHighlightIndex((prev) => (prev <= 0 ? combinedTools.length - 1 : prev - 1));
        return;
      }

      if (key.downArrow) {
        setHighlightIndex((prev) => (prev >= combinedTools.length - 1 ? 0 : prev + 1));
        return;
      }

      if (input === ' ') {
        toggleTool(combinedTools[highlightIndex]);
        return;
      }

      if (key.return) {
        onSubmit?.();
      }
    },
    { isActive: focus },
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
      <Box flexDirection="column">
        {combinedTools.map((toolName, index) => {
          const isHighlighted = focus && index === highlightIndex;
          const isSelected = selectedTools.includes(toolName);
          return (
            <Text key={toolName} color={isHighlighted ? theme.colors.primary : theme.modal.help} bold={isHighlighted}>
              {isSelected ? '●' : '○'} {toolName}
            </Text>
          );
        })}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.modal.help}>Use ↑/↓ to navigate, Space to toggle selection, Enter to continue</Text>
      </Box>
    </Box>
  );
};
