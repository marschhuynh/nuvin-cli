import { Text, Box } from 'ink';
import { AppModal } from '@/components/AppModal.js';

import { commandRegistry } from '@/modules/commands/registry.js';
import type { CommandRegistry, CommandComponentProps } from '@/modules/commands/types.js';
import { getVersionInfo } from '@/utils/version.js';

const { version, commit } = getVersionInfo();

const HelpModal = ({ deactivate }: CommandComponentProps) => {
  return (
    <AppModal visible={true} title="Help" type="info" onClose={deactivate} closeOnEscape={true} closeOnEnter={true}>
      <Text color="gray" dimColor>
        {`@nuvin/cli v${version}${commit ? ` (${commit})` : ''}`}
      </Text>

      <Box marginTop={1} flexDirection="column">
        <Text>
          Press <Text color="green">ESC</Text> to close this help.
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="yellow" bold>
          Keybindings
        </Text>
        <Text>
          • <Text color="green">/</Text> — Open command menu
        </Text>
        <Text>
          • <Text color="green">ESC</Text> — Close active modal/menu, or clear input (double press)
        </Text>
        <Text>
          • <Text color="green">↑/↓</Text> — Recall previous/next user messages (when typing)
        </Text>
        <Text>
          • <Text color="green">Enter</Text> — Send message or select item
        </Text>
        <Text>
          • <Text color="green">Ctrl+C Ctrl+C</Text> — Exit application (double press)
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text color="yellow" bold>
          Commands
        </Text>
        {commandRegistry.list({ includeHidden: false }).map((cmd) => (
          <Text key={cmd.id}>
            • <Text color="green">{cmd.id}</Text> — {cmd.description}
          </Text>
        ))}
      </Box>
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
    onExit({ eventBus }) {
      eventBus.emit('ui:help:close', undefined);
    },
  });
}
