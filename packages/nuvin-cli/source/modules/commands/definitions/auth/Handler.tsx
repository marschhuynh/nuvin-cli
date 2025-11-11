import { useMemo, useState, useCallback, useEffect } from 'react';
import { Box, Text } from 'ink';
import SelectInput from '@/components/SelectInput/index.js';
import { AppModal } from '@/components/AppModal.js';
import type { CommandComponentProps } from '@/modules/commands/types.js';
import {
  PROVIDER_ITEMS,
  PROVIDER_LABELS,
  PROVIDER_AUTH_METHODS,
  type ProviderKey,
  type AuthMethod,
  type ProviderItem,
  type AuthMethodItem,
} from '@/const.js';

import { exchangeCodeForToken, createApiKey } from './anthropic-oauth.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { DeviceFlowUI, OAuthUI, TokenInputUI } from '@/components/auth/index.js';
import { useDeviceFlow } from '@/hooks/useDeviceFlow.js';
import { useOAuth } from '@/hooks/useOAuth.js';
import { useAuthStorage } from '@/hooks/useAuthStorage.js';

type Stage = 'provider' | 'method' | 'tokenEntry' | 'deviceFlow' | 'oauthMax' | 'oauthConsole';

type StatusMessage = {
  type: 'info' | 'success' | 'error';
  message: string;
} | null;

const getColorForStatus = (status: StatusMessage) => {
  if (!status) return 'white';
  return status.type === 'error'
    ? 'red'
    : status.type === 'success'
      ? 'green'
      : status.type === 'info'
        ? 'cyan'
        : 'white';
};

export const AuthCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const [stage, setStage] = useState<Stage>('provider');
  const [provider, setProvider] = useState<ProviderKey | null>(null);
  const [tokenValue, setTokenValue] = useState('');
  const [status, setStatus] = useState<StatusMessage>(null);

  const deviceFlowState = useDeviceFlow(stage === 'deviceFlow' && provider === 'github');
  const oauthMode = stage === 'oauthMax' ? 'max' : 'console';
  const oauthState = useOAuth(
    (stage === 'oauthMax' || stage === 'oauthConsole') && provider === 'anthropic',
    oauthMode,
  );
  const { saveApiKeyAuth, saveOAuthAuth } = useAuthStorage({
    get: context.config.get.bind(context.config),
    set: context.config.set.bind(context.config),
  });

  const methodItems = useMemo<AuthMethodItem[]>(() => {
    if (!provider) return [];
    return PROVIDER_AUTH_METHODS[provider] ?? [];
  }, [provider]);

  const resetToProviderStage = useCallback((message?: StatusMessage) => {
    setProvider(null);
    setStage('provider');
    setTokenValue('');
    setStatus(message ?? null);
  }, []);

  const handleProviderSelect = useCallback((item: ProviderItem) => {
    setProvider(item.value);
    setStage('method');
    setStatus(null);
    setTokenValue('');
  }, []);

  const handleMethodSelect = useCallback(
    (item: AuthMethodItem) => {
      if (!provider) return;

      setStatus(null);
      setTokenValue('');

      switch (item.value) {
        case 'token':
          setStage('tokenEntry');
          return;
        case 'device-flow':
          setStage('deviceFlow');
          return;
        case 'oauth-max':
          setStage('oauthMax');
          return;
        case 'oauth-console':
          setStage('oauthConsole');
          return;
        case 'none': {
          const providerKey = provider;
          resetToProviderStage({
            type: 'info',
            message: `${PROVIDER_LABELS[providerKey]} does not require authentication.`,
          });
          return;
        }
        default:
          resetToProviderStage();
          return;
      }
    },
    [provider, resetToProviderStage],
  );

  const handleTokenSubmit = useCallback(
    async (value: string) => {
      if (!provider) return;
      const trimmed = value.trim();
      if (!trimmed) {
        setStatus({ type: 'error', message: 'Token cannot be empty.' });
        return;
      }

      try {
        await saveApiKeyAuth(provider, trimmed);
        resetToProviderStage({
          type: 'success',
          message: `${PROVIDER_LABELS[provider]} API key saved to configuration.`,
        });
      } catch (error) {
        resetToProviderStage({
          type: 'error',
          message: `Failed to save ${PROVIDER_LABELS[provider]} API key: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
      }
    },
    [provider, saveApiKeyAuth, resetToProviderStage],
  );

  const handleOAuthCodeSubmit = useCallback(
    async (code: string, verifier: string, mode: 'max' | 'console') => {
      if (!provider || provider !== 'anthropic') return;
      const trimmed = code.trim();
      if (!trimmed) {
        setStatus({
          type: 'error',
          message: 'Authorization code cannot be empty.',
        });
        return;
      }

      try {
        const credentials = await exchangeCodeForToken(trimmed, verifier);
        if (credentials.type === 'failed' || !credentials.access) {
          setStatus({
            type: 'error',
            message: 'Failed to exchange authorization code for token.',
          });
          return;
        }

        let message: string;

        if (mode === 'console') {
          const apiKeyResult = await createApiKey(credentials.access);
          if (apiKeyResult.type === 'failed' || !apiKeyResult.key) {
            setStatus({ type: 'error', message: 'Failed to create API key.' });
            return;
          }

          await saveApiKeyAuth(provider, apiKeyResult.key);
          message = 'Anthropic API key created and saved to configuration.';
        } else {
          if (!credentials.refresh) {
            setStatus({ type: 'error', message: 'Missing refresh token.' });
            return;
          }
          await saveOAuthAuth(provider, credentials.access, credentials.refresh, credentials.expires);
          message = 'Anthropic OAuth credentials saved to configuration.';
        }

        resetToProviderStage({
          type: 'success',
          message,
        });
      } catch (error) {
        setStatus({
          type: 'error',
          message: `Anthropic authentication failed: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    },
    [provider, saveApiKeyAuth, saveOAuthAuth, resetToProviderStage],
  );

  // Handle device flow success
  useEffect(() => {
    if (deviceFlowState.status === 'success' && stage === 'deviceFlow' && provider) {
      (async () => {
        try {
          await saveApiKeyAuth(provider, deviceFlowState.token);
          resetToProviderStage({
            type: 'success',
            message: 'GitHub device flow token saved to configuration.',
          });
        } catch (error) {
          resetToProviderStage({
            type: 'error',
            message: `Failed to save GitHub token: ${error instanceof Error ? error.message : String(error)}`,
          });
        }
      })();
    }
  }, [deviceFlowState.status, stage, provider, deviceFlowState.token, saveApiKeyAuth, resetToProviderStage]);

  const renderStage = () => {
    switch (stage) {
      case 'provider':
        return (
          <Box marginTop={1} flexDirection="column">
            <Text>Select provider:</Text>
            <Box marginTop={1}>
              <SelectInput<ProviderKey> items={PROVIDER_ITEMS} onSelect={handleProviderSelect} />
            </Box>
          </Box>
        );
      case 'method':
        return (
          <Box marginTop={1} flexDirection="column">
            {provider ? (
              <Text>
                Provider: <Text color={theme.auth.provider}>{PROVIDER_LABELS[provider]}</Text>
              </Text>
            ) : null}
            <Text>Select method:</Text>
            <Box marginTop={1}>
              <SelectInput<AuthMethod> items={methodItems} onSelect={handleMethodSelect} />
            </Box>
          </Box>
        );
      case 'tokenEntry':
        if (!provider) return null;
        return (
          <Box marginTop={1} flexDirection="column">
            <Text>
              Provider: <Text color={theme.auth.provider}>{PROVIDER_LABELS[provider]}</Text>
            </Text>
            <Text>Enter your API key or token, then press Enter.</Text>
            <Box marginTop={1}>
              <TokenInputUI
                value={tokenValue}
                onChange={setTokenValue}
                onSubmit={handleTokenSubmit}
                placeholder="Paste token here"
              />
            </Box>
          </Box>
        );
      case 'deviceFlow':
        return (
          <Box marginTop={1} flexDirection="column">
            <Text>
              Provider: <Text color={theme.auth.provider}>GitHub (Copilot)</Text>
            </Text>
            <DeviceFlowUI
              state={deviceFlowState}
              theme={{
                waiting: theme.auth.waiting,
                link: theme.auth.link,
                code: theme.auth.code,
                error: theme.auth.error,
              }}
            />
          </Box>
        );
      case 'oauthMax':
      case 'oauthConsole': {
        const mode = stage === 'oauthMax' ? 'max' : 'console';
        const flowLabel = stage === 'oauthMax' ? 'Claude Pro/Max' : 'Console';
        return (
          <Box marginTop={1} flexDirection="column">
            <Text>
              Provider: <Text color={theme.auth.provider}>Anthropic ({flowLabel})</Text>
            </Text>
            <OAuthUI
              state={oauthState}
              code={tokenValue}
              onCodeChange={setTokenValue}
              onSubmit={(value) =>
                oauthState.status === 'pending' && handleOAuthCodeSubmit(value, oauthState.verifier, mode)
              }
              theme={{
                waiting: theme.auth.waiting,
                link: theme.auth.link,
                error: theme.auth.error,
                subtitle: theme.colors.muted,
              }}
            />
          </Box>
        );
      }
      default:
        return null;
    }
  };

  return (
    <AppModal
      visible={true}
      title="Authentication"
      titleColor={theme.colors.secondary}
      type="default"
      onClose={stage === 'provider' ? deactivate : () => resetToProviderStage()}
      closeOnEscape={true}
      closeOnEnter={false}
    >
      {renderStage()}

      <Box marginTop={1} flexDirection="column">
        <Text color={theme.colors.muted}>Use arrows + Enter to choose.</Text>
        <Text color={theme.colors.muted}>Press ESC to cancel.</Text>
      </Box>

      {status ? (
        <Box marginTop={1}>
          <Text color={getColorForStatus(status)}>{status.message}</Text>
        </Box>
      ) : null}
    </AppModal>
  );
};
