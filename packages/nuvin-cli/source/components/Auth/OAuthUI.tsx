import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import TextInput from '@/components/TextInput/index.js';
import type { OAuthState } from '@/hooks/useOAuth.js';

type Props = {
  state: OAuthState;
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: (code: string) => void;
  onOpenBrowser?: () => void;
  theme?: {
    waiting?: string;
    link?: string;
    error?: string;
    subtitle?: string;
  };
};

export function OAuthUI({ state, code, onCodeChange, onSubmit, onOpenBrowser, theme = {} }: Props) {
  useInput(
    (_input, key) => {
      if (state.status === 'ready' && key.return && onOpenBrowser) {
        onOpenBrowser();
      }
    },
    { isActive: state.status === 'ready' }
  );

  return (
    <Box flexDirection="column">
      {state.status === 'generating' && <Text color={theme.waiting || 'cyan'}>Generating authorization URL...</Text>}

      {state.status === 'ready' && (
        <Box flexDirection="column">
          <Box marginTop={1}>
            <Text dimColor>
              URL: <Text color={theme.link || 'blue'}>{state.url}</Text>
            </Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.waiting || 'cyan'}>Press Enter to open browser...</Text>
          </Box>
        </Box>
      )}

      {state.status === 'pending' && (
        <Box flexDirection="column">
          <Text>Browser opened</Text>
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
