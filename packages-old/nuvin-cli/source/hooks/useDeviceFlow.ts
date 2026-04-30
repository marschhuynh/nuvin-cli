import { useState, useEffect, useCallback } from 'react';
import { generateVerificationCode, getAccessToken } from '@/modules/commands/definitions/auth/gh-device-flow.js';
import open from 'open';

export type DeviceFlowState =
  | { status: 'idle' }
  | { status: 'requesting' }
  | { status: 'ready'; userCode: string; verificationUri: string; deviceCode: string }
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

        setState({ status: 'ready', userCode, verificationUri, deviceCode });
      } catch (error) {
        if (canceled) return;
        setState({ status: 'error', error: String(error) });
      }
    })();

    return () => {
      canceled = true;
    };
  }, [trigger]);

  const openAndPoll = useCallback(async () => {
    if (state.status !== 'ready') return;

    const { deviceCode, userCode, verificationUri } = state;

    try {
      await open(verificationUri);
    } catch (_error) {
      // Ignore browser open errors
    }

    setState({ status: 'polling', userCode, verificationUri });

    try {
      const token = await getAccessToken(deviceCode, false);
      setState({ status: 'success', token });
    } catch (error) {
      setState({ status: 'error', error: String(error) });
    }
  }, [state]);

  return { state, openAndPoll };
}
