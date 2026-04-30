import { useMemo, useState, useCallback, useEffect } from 'react';
import { Box, Text } from 'ink';
import { ScrollableSelectList, type ScrollableSelectItem } from '@/components/ScrollableSelectList/index.js';
import { AppModal } from '@/components/AppModal.js';
import type { CommandComponentProps } from '@/modules/commands/types.js';
import { getProviderAuthMethods, type ProviderKey, type ProviderItem, type AuthMethodItem } from '@/const.js';
import { buildProviderOptions, getProviderLabel } from '@/config/providers.js';

import { exchangeCodeForToken, createApiKey } from './anthropic-oauth.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { DeviceFlowUI, OAuthUI, TokenInputUI } from '@/components/Auth/index.js';
import { useDeviceFlow } from '@/hooks/useDeviceFlow.js';
import { useOAuth } from '@/hooks/useOAuth.js';
import { useAuthStorage } from '@/hooks/useAuthStorage.js';
import { useNotification } from '@/hooks/useNotification.js';
import { useStdoutDimensions } from '@/hooks/useStdoutDimensions.js';
import type { Theme } from '@/theme.js';

type Stage = 'provider' | 'method' | 'tokenEntry' | 'deviceFlow' | 'oauthMax' | 'oauthConsole';

type StatusMessage = {
  type: 'info' | 'success' | 'error';
  message: string;
  close?: boolean;
} | null;

const getColorForStatus = (status: StatusMessage, theme: Theme) => {
  if (!status) return theme.tokens.white;
  return status.type === 'error'
    ? theme.tokens.red
    : status.type === 'success'
      ? theme.tokens.green
      : status.type === 'info'
        ? theme.tokens.cyan
        : theme.tokens.white;
};

export const AuthCommandComponent = ({ context, deactivate }: CommandComponentProps) => {
  const { theme } = useTheme();
  const { rows } = useStdoutDimensions();

  // Parse provider from command arguments (e.g., "/auth anthropic" or "/auth anthropic --return-to-model")
  const args = context.rawInput.trim().split(/\s+/);
  const initialProvider = args.length > 1 && !args[1].startsWith('--') ? (args[1] as ProviderKey) : null;
  const shouldReturnToModel = args.includes('--return-to-model');

  const [stage, setStage] = useState<Stage>(initialProvider ? 'method' : 'provider');
  const [provider, setProvider] = useState<ProviderKey | null>(initialProvider);
  const [tokenValue, setTokenValue] = useState('');
  const [status, setStatus] = useState<StatusMessage>(null);
  const [providerIndex, setProviderIndex] = useState(0);
  const [methodIndex, setMethodIndex] = useState(0);
  const { setNotification } = useNotification();

  const modalHeight = Math.min(rows - 4, 20);
  const listMaxHeight = modalHeight - 6;

  const { state: deviceFlowState, openAndPoll: openDeviceFlow } = useDeviceFlow(
    stage === 'deviceFlow' && provider === 'github',
  );
  const oauthMode = stage === 'oauthMax' ? 'max' : 'console';
  const { state: oauthState, openBrowser: openOAuthBrowser } = useOAuth(
    (stage === 'oauthMax' || stage === 'oauthConsole') && provider === 'anthropic',
    oauthMode,
  );
  const { saveApiKeyAuth, saveOAuthAuth } = useAuthStorage({
    get: context.config.get.bind(context.config),
    set: context.config.set.bind(context.config),
  });

  const methodItems = useMemo<AuthMethodItem[]>(() => {
    if (!provider) return [];
    return getProviderAuthMethods(provider);
  }, [provider]);

  const providerOptions = useMemo(() => buildProviderOptions(), []);
  const providerItems: ScrollableSelectItem<ProviderItem>[] = useMemo(
    () => providerOptions.map((opt) => ({ key: opt.value, value: opt })),
    [providerOptions],
  );

  const methodScrollItems: ScrollableSelectItem<AuthMethodItem>[] = useMemo(
    () => methodItems.map((item) => ({ key: item.value, value: item })),
    [methodItems],
  );

  // Handle initial provider selection
  useEffect(() => {
    if (initialProvider && stage === 'method') {
      setStatus(null);
      setTokenValue('');
    }
  }, [initialProvider, stage]);

  const resetToProviderStage = useCallback(
    (message?: StatusMessage) => {
      setProvider(null);
      setStage('provider');
      setTokenValue('');
      setStatus(message ?? null);
      if (message?.close) {
        setNotification(message.message, 3000);
        deactivate();

        // If this auth was initiated from /model command, navigate back to /model
        if (shouldReturnToModel && provider) {
          setTimeout(() => {
            context.registry.execute('/model');
          }, 100); // Small delay to ensure modal closes first
        }
      }
    },
    [setNotification, deactivate, shouldReturnToModel, provider, context],
  );

  const handleProviderSelect = useCallback((item: ScrollableSelectItem<ProviderItem>) => {
    setProvider(item.value.value);
    setStage('method');
    setStatus(null);
    setTokenValue('');
    setMethodIndex(0);
  }, []);

  const handleMethodSelect = useCallback(
    (item: ScrollableSelectItem<AuthMethodItem>) => {
      if (!provider) return;

      setStatus(null);
      setTokenValue('');

      switch (item.value.value) {
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
            message: `${getProviderLabel(providerKey)} does not require authentication.`,
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
          message: `${getProviderLabel(provider)} API key saved to configuration.`,
          close: true,
        });
      } catch (error) {
        resetToProviderStage({
          type: 'error',
          message: `Failed to save ${getProviderLabel(provider)} API key: ${
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
  }, [deviceFlowState, stage, provider, saveApiKeyAuth, resetToProviderStage]);

  const renderSelectItem = (item: { label: string }, isSelected: boolean) => (
    <Box>
      <Text color={isSelected ? theme.colors.accent : undefined}>{isSelected ? '❯ ' : '  '}</Text>
      <Text color={isSelected ? theme.colors.accent : undefined} bold={isSelected}>
        {item.label}
      </Text>
    </Box>
  );

  const renderStage = () => {
    switch (stage) {
      case 'provider':
        return (
          <Box flexDirection="column" flexGrow={1} overflow="hidden">
            <Text>Select provider:</Text>
            <Box marginTop={1} flexGrow={1} overflow="hidden">
              <ScrollableSelectList
                items={providerItems}
                selectedIndex={providerIndex}
                onHighlight={(_, index) => setProviderIndex(index)}
                onSelect={handleProviderSelect}
                renderItem={renderSelectItem}
                maxHeight={listMaxHeight}
              />
            </Box>
          </Box>
        );
      case 'method':
        return (
          <Box flexDirection="column" flexGrow={1} overflow="hidden">
            {provider ? (
              <Text>
                Provider: <Text color={theme.auth.provider}>{getProviderLabel(provider)}</Text>
              </Text>
            ) : null}
            <Text>Select method:</Text>
            <Box marginTop={1} flexGrow={1} overflow="hidden">
              <ScrollableSelectList
                items={methodScrollItems}
                selectedIndex={methodIndex}
                onHighlight={(_, index) => setMethodIndex(index)}
                onSelect={handleMethodSelect}
                renderItem={renderSelectItem}
                maxHeight={listMaxHeight}
              />
            </Box>
          </Box>
        );
      case 'tokenEntry':
        if (!provider) return null;
        return (
          <Box flexDirection="column">
            <Text>
              Provider: <Text color={theme.auth.provider}>{getProviderLabel(provider)}</Text>
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
          <Box flexDirection="column">
            <Text>
              Provider: <Text color={theme.auth.provider}>GitHub (Copilot)</Text>
            </Text>
            <DeviceFlowUI
              state={deviceFlowState}
              onOpenBrowser={openDeviceFlow}
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
              onOpenBrowser={openOAuthBrowser}
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
      onClose={stage === 'provider' ? deactivate : () => resetToProviderStage()}
      closeOnEscape={true}
      closeOnEnter={false}
      height={modalHeight}
    >
      {renderStage()}

      {status ? (
        <Box marginTop={1}>
          <Text color={getColorForStatus(status, theme)}>{status.message}</Text>
        </Box>
      ) : null}
    </AppModal>
  );
};
