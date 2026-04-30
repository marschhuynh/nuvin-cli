import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import * as crypto from 'node:crypto';
import SelectInput from '@/components/SelectInput/index.js';
import { AppModal } from '@/components/AppModal.js';
import type { CommandRegistry, CommandComponentProps, CommandContext } from '@/modules/commands/types.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { THINKING_LEVELS, type ThinkingLevel } from '@/config/types.js';

const parseThinkingLevel = (input: string): ThinkingLevel | null => {
  const normalized = input.toUpperCase();
  if (normalized === 'OFF' || normalized === 'LOW' || normalized === 'MEDIUM' || normalized === 'HIGH') {
    return normalized as ThinkingLevel;
  }
  return null;
};

const applyThinkingLevel = async (level: ThinkingLevel, context: CommandContext) => {
  try {
    await context.config.set('thinking', level, 'global');

    context.eventBus.emit('ui:line', {
      id: crypto.randomUUID(),
      type: 'info' as const,
      content: `Thinking display set to: ${level}`,
      metadata: { timestamp: new Date().toISOString() },
    });
  } catch (error) {
    context.eventBus.emit('ui:line', {
      id: crypto.randomUUID(),
      type: 'error' as const,
      content: `Failed to save thinking preference: ${error instanceof Error ? error.message : String(error)}`,
      metadata: { timestamp: new Date().toISOString() },
    });
  }
};

const ThinkingCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();

  useInput(
    (_input, key) => {
      if (key.escape) {
        deactivate();
      }
    },
    { isActive: true },
  );

  const thinkingOptions = [
    { label: 'OFF - Disable thinking (no thinking content returned)', value: THINKING_LEVELS.OFF },
    { label: 'LOW - Minimal thinking (1024 token budget)', value: THINKING_LEVELS.LOW },
    { label: 'MEDIUM - Balanced thinking (4096 token budget)', value: THINKING_LEVELS.MEDIUM },
    { label: 'HIGH - Detailed thinking (16384 token budget)', value: THINKING_LEVELS.HIGH },
  ];

  const handleThinkingSelect = async (item: { label: string; value: string }) => {
    const level = item.value as ThinkingLevel;
    await applyThinkingLevel(level, context);
    deactivate();
  };

  return (
    <AppModal
      visible={true}
      title="Thinking Configuration"
      onClose={deactivate}
      closeOnEscape={true}
      closeOnEnter={false}
    >
      <Text color={theme.thinking.subtitle} dimColor>
        Select the thinking display level
      </Text>
      <Box marginTop={1}>
        <SelectInput items={thinkingOptions} onSelect={handleThinkingSelect} />
      </Box>
    </AppModal>
  );
};

export function registerThinkingCommand(registry: CommandRegistry) {
  registry.register({
    id: '/thinking',
    type: 'component',
    description: 'Configure thinking display level: /thinking [off|low|medium|high]',
    category: 'debug',
    component: ThinkingCommandComponent,
    createState({ rawInput }) {
      const parts = rawInput.trim().split(/\s+/);
      const arg = parts.slice(1).join(' ').trim();
      return { arg };
    },
    async handler({ rawInput, eventBus, config }) {
      const parts = rawInput.trim().split(/\s+/);
      const arg = parts.slice(1).join(' ').trim();

      if (!arg) {
        return;
      }

      const level = parseThinkingLevel(arg);
      if (!level) {
        eventBus.emit('ui:line', {
          id: crypto.randomUUID(),
          type: 'error' as const,
          content: `Invalid thinking level: "${arg}". Use: off, low, medium, or high`,
          metadata: { timestamp: new Date().toISOString() },
        });
        return;
      }

      await applyThinkingLevel(level, { rawInput, eventBus, config } as CommandContext);
    },
  });
}
