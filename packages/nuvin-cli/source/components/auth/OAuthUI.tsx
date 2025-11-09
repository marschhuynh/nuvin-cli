import { Box, Text } from 'ink';
import TextInput from '@/components/TextInput/index.js';
import type { OAuthState } from '@/hooks/useOAuth.js';

type Props = {
  state: OAuthState;
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: (code: string) => void;
  theme?: {
    waiting?: string;
    link?: string;
    error?: string;
    subtitle?: string;
  };
};

export function OAuthUI({ state, code, onCodeChange, onSubmit, theme = {} }: Props) {
  return (
    <Box flexDirection="column">
      {state.status === 'generating' && <Text color={theme.waiting || 'cyan'}>Generating authorization URL...</Text>}

      {state.status === 'pending' && (
        <Box flexDirection="column">
          <Text>Browser opened automatically</Text>
          <Text color={theme.subtitle || 'gray'} dimColor>
            {state.instructions}
          </Text>
          <Box marginTop={1} marginBottom={1}>
            <TextInput
              value={code}
              placeholder="Paste authorization code here"
              onChange={onCodeChange}
              onSubmit={onSubmit}
              focus
              showCursor
            />
          </Box>
        </Box>
      )}

      {state.status === 'error' && <Text color={theme.error || 'red'}>Error: {state.error}</Text>}
    </Box>
  );
}
