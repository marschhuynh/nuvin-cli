import { useState, useEffect } from 'react';
import { generateVerificationCode, getAccessToken } from '@/modules/commands/definitions/auth/gh-device-flow.js';
import open from 'open';

export type DeviceFlowState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'pending'; userCode: string; verificationUri: string }
  | { status: 'polling'; userCode: string; verificationUri: string }
  | { status: 'success'; token: string }
  | { status: 'error'; error: string };

export function useDeviceFlow(trigger: boolean) {
  const [state, setState] = useState<DeviceFlowState>({ status: 'idle' });

  useEffect(() => {
    if (!trigger) return;

    let canceled = false;

    (async () => {
      try {
        setState({ status: 'requesting' });
        const { deviceCode, userCode, verificationUri } = await generateVerificationCode();
        if (canceled) return;

        setState({ status: 'pending', userCode, verificationUri });

        try {
          await open(verificationUri);
        } catch (_error) {
          // Ignore browser open errors
        }

        setState({ status: 'polling', userCode, verificationUri });
        const token = await getAccessToken(deviceCode, false);
        if (canceled) return;

        setState({ status: 'success', token });
      } catch (error) {
        if (canceled) return;
        setState({ status: 'error', error: String(error) });
      }
    })();

    return () => {
      canceled = true;
    };
  }, [trigger]);

  return state;
}
