import { Text, Box } from 'ink';
import { AppModal } from '@/components/AppModal.js';
import { AutoScrollBox } from '@/components/AutoScrollBox.js';
import { HelpText } from '@/components/HelpText.js';

import { commandRegistry } from '@/modules/commands/registry.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { getVersionInfo } from '@/utils/version.js';
import { useTheme } from '@/contexts/ThemeContext';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';

const { version, commit } = getVersionInfo();

const HelpModal = ({ deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();
  const modalHeight = rows - 4;

  const footerContent = (
    <Box marginLeft={1} flexGrow={1} marginRight={1} flexShrink={0}>
      <HelpText
        segments={[
          { text: '↑↓/j/k', highlight: true },
          { text: ' scroll • ' },
          { text: 'g/G', highlight: true },
          { text: ' top/bottom • ' },
          { text: 'ESC/Enter', highlight: true },
          { text: ' close' },
        ]}
      />
    </Box>
  );

  return (
    <AppModal
      visible={true}
      title="Help"
      onClose={deactivate}
      closeOnEscape={true}
      closeOnEnter={true}
      height={modalHeight}
      footer={footerContent}
      paddingX={1}
      paddingY={0}
    >
      <AutoScrollBox
        flexGrow={1}
        enableKeyboardScroll={true}
        enableMouseScroll={true}
        autoScrollToBottom={false}
        showScrollbar={true}
        focus={true}
      >
        <Box flexDirection="column">
          <Text color="gray" dimColor>
            {`@nuvin/cli v${version}${commit ? ` (${commit})` : ''}`}
          </Text>

          <Box marginTop={1} flexDirection="column">
            <Text color="yellow" bold>
              Keybindings
            </Text>
            <Text>
              • <Text color={theme.tokens.green}>/</Text> — Open command menu
            </Text>
            <Text>
              • <Text color={theme.tokens.green}>ESC</Text> — Close active modal/menu, or clear input (double press)
            </Text>
            <Text>
              • <Text color={theme.tokens.green}>↑/↓</Text> — Recall previous/next user messages (when typing)
            </Text>
            <Text>
              • <Text color={theme.tokens.green}>Enter</Text> — Send message or select item
            </Text>
            <Text>
              • <Text color={theme.tokens.green}>Ctrl+C Ctrl+C</Text> — Exit application (double press)
            </Text>
          </Box>

          <Box marginTop={1} marginBottom={1} flexDirection="column">
            <Text color="yellow" bold>
              Commands
            </Text>
            {commandRegistry.list({ includeHidden: false }).map((cmd) => (
              <Text key={cmd.id}>
                • <Text color={theme.tokens.green}>{cmd.id}</Text> — {cmd.description}
              </Text>
            ))}
          </Box>
        </Box>
      </AutoScrollBox>
    </AppModal>
  );
};

export function registerHelpCommand(registry: CommandRegistry) {
  registry.register({
    id: '/help',
    type: 'component',
    description: 'Show available commands and shortcuts.',
    category: 'ui',
    component: HelpModal,
  });
}
