import { Box, Text } from 'ink';
import TextInput from '@/components/TextInput/index.js';

type Props = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  helpText?: string;
  mask?: string;
  theme?: {
    subtitle?: string;
  };
};

export function TokenInputUI({
  value,
  onChange,
  onSubmit,
  placeholder = 'Paste token here',
  helpText,
  mask,
  theme = {},
}: Props) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <TextInput
          value={value}
          placeholder={placeholder}
          onChange={onChange}
          onSubmit={onSubmit}
          focus
          showCursor
          mask={mask}
        />
      </Box>

      {helpText && (
        <Box>
          <Text color={theme.subtitle || 'gray'} dimColor>
            {helpText}
          </Text>
        </Box>
      )}
    </Box>
  );
}
