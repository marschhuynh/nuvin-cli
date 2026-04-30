import { useState, useEffect, useCallback } from 'react';
import { generateAuthUrl } from '@/modules/commands/definitions/auth/anthropic-oauth.js';
import open from 'open';

export type OAuthState =
  | { status: 'idle' }
  | { status: 'generating' }
  | { status: 'ready'; url: string; verifier: string; instructions: string }
  | { status: 'pending'; url: string; verifier: string; instructions: string }
  | { status: 'error'; error: string };

export function useOAuth(trigger: boolean, mode: 'max' | 'console') {
  const [state, setState] = useState<OAuthState>({ status: 'idle' });

  useEffect(() => {
    if (!trigger) return;

    let canceled = false;

    (async () => {
      try {
        setState({ status: 'generating' });
        const { url, verifier, instructions } = await generateAuthUrl(mode);
        if (canceled) return;

        setState({ status: 'ready', url, verifier, instructions });
      } catch (error) {
        if (canceled) return;
        setState({ status: 'error', error: String(error) });
      }
    })();

    return () => {
      canceled = true;
    };
  }, [trigger, mode]);

  const openBrowser = useCallback(async () => {
    if (state.status !== 'ready') return;

    const { url, verifier, instructions } = state;

    try {
      await open(url);
    } catch (_error) {
      // Ignore browser open errors
    }

    setState({ status: 'pending', url, verifier, instructions });
  }, [state]);

  return { state, openBrowser };
}
