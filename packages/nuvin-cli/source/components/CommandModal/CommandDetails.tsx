import type React from 'react';
import { Box, Text } from 'ink';
import { useTheme } from '@/contexts/ThemeContext.js';
import type { CompleteCustomCommand, CommandSource } from '@nuvin/nuvin-core';

interface CommandDetailsProps {
  command: CompleteCustomCommand | undefined;
  shadowedCommands: CompleteCustomCommand[];
  activeProfile?: string;
}

const SOURCE_NAMES: Record<CommandSource, string> = {
  global: 'Global',
  profile: 'Profile',
  local: 'Local',
};

export const CommandDetails: React.FC<CommandDetailsProps> = ({ command, shadowedCommands, activeProfile }) => {
  const { theme } = useTheme();

  const getSourceDisplay = (source: CommandSource): string => {
    if (source === 'profile' && activeProfile) {
      return `Profile (${activeProfile})`;
    }
    return SOURCE_NAMES[source];
  };

  const truncatePrompt = (prompt: string, maxLines: number = 8): string => {
    const lines = prompt.split('\n');
    if (lines.length <= maxLines) {
      return prompt;
    }
    return `${lines.slice(0, maxLines).join('\n')}\n...`;
  };

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box marginBottom={1}>
        <Text color={theme.history.unselected}>Details</Text>
      </Box>

      {!command ? (
        <Text color={theme.history.help}>Select a command to view details</Text>
      ) : (
        <Box flexDirection="column">
          <Box flexDirection="column" marginBottom={1}>
            <Text color={theme.history.help} dimColor>
              Name:
            </Text>
            <Text bold>/{command.id}</Text>
          </Box>

          <Box flexDirection="column" marginBottom={1}>
            <Text color={theme.history.help} dimColor>
              Source:
            </Text>
            <Text>{getSourceDisplay(command.source)}</Text>
          </Box>

          {shadowedCommands.length > 0 && (
            <Box flexDirection="column" marginBottom={1}>
              <Text color="yellow">
                ⚠ Shadows: {shadowedCommands.map((c) => SOURCE_NAMES[c.source].toLowerCase()).join(', ')}
              </Text>
            </Box>
          )}

          <Box flexDirection="column" marginBottom={1}>
            <Text color={theme.history.help} dimColor>
              Description:
            </Text>
            <Text>{command.description}</Text>
          </Box>

          <Box flexDirection="column" marginBottom={1}>
            <Text color={theme.history.help} dimColor>
              Prompt Template:
            </Text>
            <Box borderStyle="single" borderColor={theme.history.help} paddingX={1}>
              <Text>{truncatePrompt(command.prompt)}</Text>
            </Box>
          </Box>

          <Box marginTop={1}>
            <Text color="yellow" dimColor>
              Press E to edit or X to delete this command
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};
