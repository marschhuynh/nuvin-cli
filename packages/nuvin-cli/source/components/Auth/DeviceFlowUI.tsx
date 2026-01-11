import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import type { DeviceFlowState } from '@/hooks/useDeviceFlow.js';

type Props = {
  state: DeviceFlowState;
  onOpenBrowser?: () => void;
  showCode?: boolean;
  theme?: {
    waiting?: string;
    link?: string;
    code?: string;
    error?: string;
  };
};

export function DeviceFlowUI({ state, onOpenBrowser, showCode = true, theme = {} }: Props) {
  useInput(
    (_input, key) => {
      if (state.status === 'ready' && key.return && onOpenBrowser) {
        onOpenBrowser();
      }
    },
    { isActive: state.status === 'ready' },
  );

  return (
    <Box flexDirection="column">
      {state.status === 'requesting' && <Text color={theme.waiting || 'cyan'}>Starting device flow...</Text>}

      {state.status === 'ready' && (
        <Box flexDirection="column">
          {showCode && (
            <>
              <Box marginTop={1}>
                <Text dimColor>
                  Visit: <Text color={theme.link || 'blue'}>{state.verificationUri}</Text>
                </Text>
              </Box>
              <Box>
                <Text dimColor>
                  Enter code:{' '}
                  <Text bold color={theme.code || 'yellow'}>
                    {state.userCode}
                  </Text>
                </Text>
              </Box>
            </>
          )}
          <Box marginY={1}>
            <Text color={theme.waiting || 'cyan'}>Press Enter to open browser...</Text>
          </Box>
        </Box>
      )}

      {state.status === 'polling' && (
        <Box flexDirection="column">
          {showCode && (
            <>
              <Box marginTop={1}>
                <Text dimColor>
                  Visit: <Text color={theme.link || 'blue'}>{state.verificationUri}</Text>
                </Text>
              </Box>
              <Box>
                <Text dimColor>
                  Enter code:{' '}
                  <Text bold color={theme.code || 'yellow'}>
                    {state.userCode}
                  </Text>
                </Text>
              </Box>
            </>
          )}
          <Box marginY={1}>
            <Text color={theme.waiting || 'cyan'}>Waiting for authorization...</Text>
          </Box>
        </Box>
      )}

      {state.status === 'error' && <Text color={theme.error || 'red'}>Error: {state.error}</Text>}
    </Box>
  );
}
