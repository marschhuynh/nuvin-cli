import { Box, Text } from 'ink';
import type { DeviceFlowState } from '@/hooks/useDeviceFlow.js';

type Props = {
  state: DeviceFlowState;
  showCode?: boolean;
  theme?: {
    waiting?: string;
    link?: string;
    code?: string;
    error?: string;
  };
};

export function DeviceFlowUI({ state, showCode = true, theme = {} }: Props) {
  return (
    <Box flexDirection="column">
      {state.status === 'requesting' && <Text color={theme.waiting || 'cyan'}>Starting device flow...</Text>}

      {(state.status === 'pending' || state.status === 'polling') && (
        <Box flexDirection="column">
          <Text color={theme.waiting || 'cyan'}>
            {state.status === 'pending' ? 'Opening browser...' : 'Waiting for authorization...'}
          </Text>
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
          {!showCode && <Text dimColor>Browser opened automatically. Please authorize.</Text>}
        </Box>
      )}

      {state.status === 'error' && <Text color={theme.error || 'red'}>Error: {state.error}</Text>}
    </Box>
  );
}
