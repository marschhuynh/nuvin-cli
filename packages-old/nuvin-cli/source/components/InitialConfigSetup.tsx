import { Box, Text } from 'ink';
import Gradient from 'ink-gradient';
import { useState, useEffect, useCallback } from 'react';
import { useInput } from '@/contexts/InputContext/index.js';
import { useTheme } from '@/contexts/ThemeContext.js';
import { useConfig } from '@/contexts/ConfigContext.js';
import { getVersion } from '@/utils/version.js';
import type { ProviderKey } from '@/config/const.js';
import { buildProviderOptions, type ProviderItem } from '@/config/providers.js';
import { getProviderAuthMethods, getProviderModels, type AuthMethod, type AuthMethodItem } from '@/const.js';
import { exchangeCodeForToken, createApiKey } from '@/modules/commands/definitions/auth/anthropic-oauth.js';
import { useDeviceFlow } from '@/hooks/useDeviceFlow.js';
import { useOAuth } from '@/hooks/useOAuth.js';
import { useAuthStorage } from '@/hooks/useAuthStorage.js';
import type { LLMFactoryInterface } from '@/services/LLMFactory.js';
import { DeviceFlowUI, OAuthUI, TokenInputUI } from './Auth/index.js';
import { ComboBox } from './ComboBox/index.js';
import SelectInput from './SelectInput/index.js';
import TextInput from './TextInput/index.js';

const LOGO = `Welcome to
███╗   ██╗ ██╗   ██╗ ██╗   ██╗ ██╗ ███╗   ██╗
██╔██╗ ██║ ██║   ██║ ██║   ██║ ██║ ██╔██╗ ██║
██║╚██╗██║ ██║   ██║ ╚██╗ ██╔╝ ██║ ██║╚██╗██║
██║ ╚████║ ╚██████╔╝  ╚████╔╝  ██║ ██║ ╚████║
╚═╝  ╚═══╝  ╚═════╝    ╚═══╝   ╚═╝ ╚═╝  ╚═══╝`;

type SetupStep =
  | 'provider'
  | 'auth-method'
  | 'auth-input'
  | 'auth-device-flow'
  | 'auth-oauth'
  | 'model'
  | 'model-custom'
  | 'loading-models'
  | 'complete';

interface SelectItem {
  value: string;
  label: string;
  key?: string;
  description?: string;
}

interface SelectInputItemProps {
  isSelected: boolean;
  value: string;
  label: string;
  key: string;
  description?: string;
}

const AUTH_METHOD_LABELS: Record<AuthMethod, string> = {
  'device-flow': 'Device Flow Login (Recommended)',
  token: 'API Key / Token',
  'oauth-max': 'Claude Pro/Max Account',
  'oauth-console': 'Create API Key via Console',
  none: 'No authentication',
};

const AUTH_METHOD_DESCRIPTIONS: Record<AuthMethod, string> = {
  'device-flow': 'Authenticate through your browser',
  token: 'Manually enter your API key or token',
  'oauth-max': 'Use your Claude Pro/Max subscription',
  'oauth-console': 'Create new API key via browser',
  none: 'No authentication required',
};

const TOKEN_PLACEHOLDERS: Record<ProviderKey, string> = {
  openrouter: 'sk-or-v1-...',
  deepinfra: 'Enter your DeepInfra API key',
  anthropic: 'sk-ant-...',
  github: 'ghp_...',
  zai: 'Enter your Zai API key',
  echo: '',
};

const TOKEN_HELP_LINKS: Record<ProviderKey, string> = {
  openrouter: 'Get your API key: https://openrouter.ai/keys',
  deepinfra: 'Get your API key: https://deepinfra.com/dash/api_keys',
  anthropic: 'Get your API key: https://console.anthropic.com/settings/keys',
  github: 'Generate token: https://github.com/settings/tokens',
  zai: 'Get your API key from your Zai account',
  echo: '',
};

const ProviderItemComponent: React.FC<Pick<SelectInputItemProps, 'isSelected' | 'label' | 'description'>> = ({
  isSelected,
  label,
  description,
}) => {
  const { theme } = useTheme();

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={isSelected ? theme.welcome.title : theme.welcome.subtitle} bold={isSelected}>
          {label}
        </Text>
      </Box>
      <Box paddingLeft={3}>
        <Text color={theme.welcome.subtitle} dimColor>
          {description}
        </Text>
      </Box>
    </Box>
  );
};

const AuthMethodItemComponent: React.FC<Pick<SelectInputItemProps, 'isSelected' | 'label' | 'description'>> = ({
  isSelected,
  label,
  description,
}) => {
  const { theme } = useTheme();

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={isSelected ? theme.welcome.title : theme.welcome.subtitle} bold={isSelected}>
          {label}
        </Text>
      </Box>
      <Box paddingLeft={3}>
        <Text color={theme.welcome.subtitle} dimColor>
          {description}
        </Text>
      </Box>
    </Box>
  );
};

type Props = {
  onComplete: () => void;
  llmFactory?: LLMFactoryInterface;
};

export function InitialConfigSetup({ onComplete, llmFactory }: Props) {
  const { theme } = useTheme();
  const { get, set } = useConfig();
  const [step, setStep] = useState<SetupStep>('provider');
  const [selectedProvider, setSelectedProvider] = useState<ProviderKey>('openrouter');
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<AuthMethod>('token');
  const [selectedModel, setSelectedModel] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [oauthCode, setOAuthCode] = useState('');
  const [_saving, setSaving] = useState(false);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [providerOptions, setProviderOptions] = useState<ProviderItem[]>([]);

  // Generate provider options dynamically (using actual available providers)
  useEffect(() => {
    const generateProviderOptions = async () => {
      // // Get actual available providers from LLM factory
      // const availableProviders = llmFactory?.getAvailableProviders?.() ?? [];

      // // Handle edge case: no providers available
      // if (availableProviders.length === 0) {
      //   console.warn('No providers available from LLM factory');
      //   setProviderOptions([]);
      //   return;
      // }

      // Build options using ACTUAL providers, not hardcoded list
      const options = buildProviderOptions();

      // Set the first available provider as default if current selection not available
      if (options.length > 0) {
        const firstProvider = options[0].value;
        if (!providerOptions.find((opt) => opt.value === selectedProvider)) {
          setSelectedProvider(firstProvider as ProviderKey);
        }
      }

      setProviderOptions(options);
    };

    generateProviderOptions().catch(console.error);
  }, [providerOptions.find, selectedProvider]); // Re-run when factory changes to pick up new providers

  const providerOption = providerOptions.find((p) => p.value === selectedProvider);
  const availableAuthMethods = getProviderAuthMethods(selectedProvider);
  const fallbackModels = getProviderModels(selectedProvider);
  const models = availableModels.length > 0 ? availableModels : fallbackModels;

  const { state: deviceFlowState, openAndPoll: openDeviceFlow } = useDeviceFlow(
    step === 'auth-device-flow' && selectedProvider === 'github',
  );
  const oauthMode = selectedAuthMethod === 'oauth-max' ? 'max' : 'console';
  const { state: oauthState, openBrowser: openOAuthBrowser } = useOAuth(
    step === 'auth-oauth' && selectedProvider === 'anthropic',
    oauthMode,
  );
  const { saveApiKeyAuth, saveOAuthAuth } = useAuthStorage({ get, set });

  useInput((_input, key) => {
    if (key.escape && step === 'auth-method') {
      setStep('provider');
    }
    if (key.escape && step === 'model-custom') {
      setCustomModel('');
      setStep('model');
    }
  });

  const handleAuthMethodSelect = (authMethod?: AuthMethod) => {
    const methodToUse = authMethod || selectedAuthMethod;
    if (!methodToUse) return;

    switch (methodToUse) {
      case 'token':
        setStep('auth-input');
        break;
      case 'device-flow':
        setStep('auth-device-flow');
        break;
      case 'oauth-max':
      case 'oauth-console':
        setStep('auth-oauth');
        break;
      case 'none':
        setStep('model');
        break;
    }
  };

  const handleProviderSubmit = (item: SelectItem) => {
    const providerValue = item.value as ProviderKey;
    setSelectedProvider(providerValue);
    if (providerValue !== 'echo') {
      setStep('auth-method');
      const firstAuthMethod = getProviderAuthMethods(providerValue)?.[0];
      setSelectedAuthMethod(firstAuthMethod?.value || 'token');
    } else {
      setStep('model');
    }
  };

  const handleAuthMethodSubmit = (item: SelectItem) => {
    const authMethodValue = item.value as AuthMethod;
    setSelectedAuthMethod(authMethodValue);
    handleAuthMethodSelect(authMethodValue); // Pass the value directly
  };

  const handleModelSubmit = (item: SelectItem) => {
    if (item.value === 'custom') {
      setStep('model-custom');
      return;
    }
    setSelectedModel(item.value);
    saveConfig(item.value);
  };

  const handleCustomModelSubmit = (value: string) => {
    if (!value.trim()) {
      return;
    }
    setSelectedModel(value.trim());
    saveConfig(value.trim());
  };

  const saveConfig = async (modelOverride?: string) => {
    if (_saving) return; // Prevent multiple saves

    setSaving(true);
    try {
      // Save provider first
      await set('activeProvider', selectedProvider, 'global');

      // Then save model with override if provided
      const modelToSave = modelOverride || selectedModel;
      if (modelToSave) {
        await set('model', modelToSave, 'global');
      }

      setStep('complete');
      setTimeout(() => {
        onComplete();
      }, 1500);
    } catch (error) {
      console.error('Failed to save config:', error);
      setSaving(false);
    }
  };

  const fetchModels = useCallback(async () => {
    if (!llmFactory) {
      setAvailableModels([]);
      setStep('model');
      return;
    }

    setStep('loading-models');
    setFetchError(null);

    try {
      if (!llmFactory?.getModels) {
        throw new Error('LLM factory does not support getModels');
      }
      const modelIds = await llmFactory.getModels(selectedProvider);
      setAvailableModels(modelIds);
      setStep('model');
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : 'Failed to fetch models');
      setAvailableModels([]);
      setStep('model');
    }
  }, [llmFactory, selectedProvider]);

  const handleTokenSubmit = async (value: string) => {
    if (!value.trim()) return;

    try {
      await saveApiKeyAuth(selectedProvider, value.trim());
      await fetchModels();
    } catch (error) {
      console.error('Failed to save auth:', error);
    }
  };

  const handleOAuthCodeSubmit = async (code: string) => {
    if (!code.trim() || oauthState.status !== 'pending') return;

    try {
      const credentials = await exchangeCodeForToken(code.trim(), oauthState.verifier);

      if (credentials.type === 'failed') {
        console.error('Failed to exchange code for token');
        return;
      }

      if (oauthMode === 'console') {
        if (!credentials.access) {
          console.error('No access token received');
          return;
        }
        const apiKeyResult = await createApiKey(credentials.access);
        if (apiKeyResult.type === 'failed' || !apiKeyResult.key) {
          console.error('Failed to create API key');
          return;
        }
        await saveApiKeyAuth(selectedProvider, apiKeyResult.key);
      } else {
        if (!credentials.access || !credentials.refresh) {
          console.error('Missing OAuth credentials');
          return;
        }
        await saveOAuthAuth(selectedProvider, credentials.access, credentials.refresh, credentials.expires);
      }

      await fetchModels();
    } catch (error) {
      console.error('OAuth failed:', error);
    }
  };

  // Initialize selected model when entering model step
  useEffect(() => {
    if (step === 'model' && models.length > 0 && !selectedModel) {
      const firstModel = models[0];
      if (firstModel) {
        setSelectedModel(firstModel);
      }
    }
  }, [step, models, selectedModel]);

  // Handle device flow success
  useEffect(() => {
    if (
      deviceFlowState.status === 'success' &&
      step === 'auth-device-flow' &&
      'token' in deviceFlowState &&
      deviceFlowState.token
    ) {
      (async () => {
        await saveApiKeyAuth(selectedProvider, deviceFlowState.token);
        await fetchModels();
      })();
    }
  }, [deviceFlowState.status, step, deviceFlowState, selectedProvider, saveApiKeyAuth, fetchModels]);

  return (
    <Box flexDirection="column" width="100%" paddingX={2} paddingY={1}>
      <Box alignItems="center" paddingBottom={1} flexDirection="column">
        <Gradient colors={['#FF5F6D', '#FFC371']}>
          <Text>{LOGO}</Text>
        </Gradient>
        <Box alignSelf="flex-end" marginRight={20}>
          <Gradient colors={['#FF5F6D', '#FFC371']}>
            <Text>{`v${getVersion()}`}</Text>
          </Gradient>
        </Box>
      </Box>

      <Box flexDirection="column" alignItems="center" marginTop={1} marginBottom={1}>
        <Text color={theme.welcome.title} bold>
          {step === 'provider' && 'Initial Setup'}
          {step === 'auth-method' && 'Authentication Method'}
          {step === 'auth-input' && 'Enter Credentials'}
          {step === 'auth-device-flow' && 'Device Flow'}
          {step === 'auth-oauth' && 'OAuth Authorization'}
          {step === 'loading-models' && 'Loading Models'}
          {step === 'model' && 'Select Model'}
          {step === 'model-custom' && 'Enter Custom Model'}
          {step === 'complete' && 'Setup Complete'}
        </Text>
        <Text color={theme.welcome.subtitle} dimColor>
          {step === 'provider' && "Let's get you started. Choose your AI provider:"}
          {step === 'auth-method' && 'How would you like to authenticate?'}
          {step === 'auth-input' && `Enter your ${providerOption?.label} credentials:`}
          {step === 'auth-device-flow' && 'Authenticate through your browser'}
          {step === 'auth-oauth' && 'Complete authentication in your browser'}
          {step === 'loading-models' &&
            `Fetching available models from ${providerOption?.label || providerOption?.value || 'selected provider'}...`}
          {step === 'model' && 'Choose a model for your conversations:'}
          {step === 'model-custom' &&
            `Type the exact model name for ${providerOption?.label || providerOption?.value || 'selected provider'}:`}
          {step === 'complete' && 'Configuration saved! Starting Nuvin...'}
        </Text>
      </Box>

      {step === 'provider' && (
        <Box flexDirection="column" alignItems="center" marginTop={1}>
          {providerOptions.length === 0 ? (
            <Box>
              <Text color={theme.colors.warning}>⚠ No providers are currently available.</Text>
            </Box>
          ) : (
            <SelectInput
              items={providerOptions.map((p) => {
                const [label, description] = p.label.includes(' - ') ? p.label.split(' - ', 2) : [p.label, ''];
                return {
                  key: p.value,
                  value: p.value,
                  label,
                  description,
                };
              })}
              itemComponent={({ isSelected, ...item }) => (
                <ProviderItemComponent isSelected={!!isSelected} {...(item as SelectItem)} />
              )}
              onSelect={handleProviderSubmit}
            />
          )}
        </Box>
      )}

      {step === 'auth-method' && (
        <Box flexDirection="column" alignItems="center" marginTop={1}>
          <Box marginBottom={1} flexDirection="column" alignItems="center">
            <Text color={theme.welcome.title} bold>
              {providerOption?.label}
            </Text>
          </Box>

          <SelectInput
            items={availableAuthMethods.map((method: AuthMethodItem) => ({
              key: method.value,
              value: method.value,
              label: AUTH_METHOD_LABELS[method.value as AuthMethod],
              description: AUTH_METHOD_DESCRIPTIONS[method.value as AuthMethod],
            }))}
            itemComponent={({ isSelected, ...item }) => (
              <AuthMethodItemComponent isSelected={!!isSelected} {...(item as SelectItem)} />
            )}
            onSelect={handleAuthMethodSubmit}
          />

          <Box marginTop={2}>
            <Text color={theme.welcome.subtitle} dimColor>
              ESC to go back
            </Text>
          </Box>
        </Box>
      )}

      {step === 'auth-input' && (
        <Box flexDirection="column" alignItems="center" marginTop={1}>
          <Box
            borderStyle="round"
            borderColor={theme.welcome.hint}
            paddingX={3}
            paddingY={2}
            width={70}
            flexDirection="column"
          >
            <Box marginBottom={1}>
              <Text color={theme.welcome.title} bold>
                {providerOption?.label}
              </Text>
            </Box>

            <TokenInputUI
              value={apiKey}
              onChange={setApiKey}
              onSubmit={handleTokenSubmit}
              placeholder={TOKEN_PLACEHOLDERS[selectedProvider]}
              helpText={TOKEN_HELP_LINKS[selectedProvider]}
              mask="*"
              theme={{ subtitle: theme.welcome.subtitle }}
            />
          </Box>

          <Box marginTop={2}>
            <Text color={theme.welcome.subtitle} dimColor>
              Enter to continue • Ctrl+C to exit
            </Text>
          </Box>
        </Box>
      )}

      {step === 'auth-device-flow' && (
        <Box flexDirection="column" alignItems="center" marginTop={1}>
          <Box
            borderStyle="round"
            borderColor={theme.welcome.hint}
            paddingX={3}
            paddingY={2}
            width={70}
            flexDirection="column"
          >
            <Box marginBottom={1}>
              <Text color={theme.welcome.title} bold>
                {providerOption?.label} - Device Flow
              </Text>
            </Box>

            <DeviceFlowUI
              state={deviceFlowState}
              onOpenBrowser={openDeviceFlow}
              showCode={true}
              theme={{
                waiting: theme.auth.waiting,
                link: theme.auth.link,
                code: theme.auth.code,
                error: theme.auth.error,
              }}
            />
          </Box>
        </Box>
      )}

      {step === 'auth-oauth' && (
        <Box flexDirection="column" alignItems="center" marginTop={1}>
          <Box
            borderStyle="round"
            borderColor={theme.welcome.hint}
            paddingX={3}
            paddingY={2}
            width={70}
            flexDirection="column"
          >
            <Box marginBottom={1}>
              <Text color={theme.welcome.title} bold>
                {providerOption?.label} - OAuth
              </Text>
            </Box>

            <OAuthUI
              state={oauthState}
              code={oauthCode}
              onCodeChange={setOAuthCode}
              onSubmit={handleOAuthCodeSubmit}
              onOpenBrowser={openOAuthBrowser}
              theme={{
                waiting: theme.auth.waiting,
                link: theme.auth.link,
                error: theme.auth.error,
                subtitle: theme.welcome.subtitle,
              }}
            />
          </Box>

          {oauthState.status === 'pending' && (
            <Box marginTop={2}>
              <Text color={theme.welcome.subtitle} dimColor>
                Paste code and press Enter
              </Text>
            </Box>
          )}
        </Box>
      )}

      {step === 'loading-models' && (
        <Box flexDirection="column" alignItems="center" marginTop={2}>
          <Text color={theme.colors.info}>Loading models...</Text>
        </Box>
      )}

      {step === 'model' && (
        <Box flexDirection="column" alignItems="center" marginTop={1}>
          <Box marginBottom={1} flexDirection="column" alignItems="center">
            <Text color={theme.welcome.title} bold>
              {providerOption?.label}
            </Text>
            {fetchError && (
              <Text color={theme.colors.warning} dimColor>
                {fetchError}
              </Text>
            )}
            {availableModels.length > 0 && (
              <Text color={theme.welcome.subtitle} dimColor>
                {models.length} models available
              </Text>
            )}
          </Box>

          {models.length > 10 ? (
            <ComboBox
              items={models.map((model: string) => ({
                label: model,
                value: model,
              }))}
              placeholder="Type to search models..."
              maxDisplayItems={10}
              enableRotation={true}
              onSelect={(item) => handleModelSubmit({ label: item.label, value: item.value, key: item.value })}
              onCancel={() => setStep('auth-method')}
            />
          ) : (
            <SelectInput
              items={[
                ...models.map((model: string) => ({
                  key: model,
                  value: model,
                  label: model,
                })),
                { key: 'custom', value: 'custom', label: '🎯 Enter custom model name...' },
              ]}
              onSelect={handleModelSubmit}
            />
          )}
        </Box>
      )}

      {step === 'model-custom' && (
        <Box flexDirection="column" alignItems="center" marginTop={1}>
          <Box marginBottom={1}>
            <Text color={theme.welcome.title}>Model: </Text>
            <TextInput
              value={customModel}
              onChange={setCustomModel}
              onSubmit={handleCustomModelSubmit}
              placeholder="e.g., gpt-4o or anthropic/claude-3-opus"
            />
          </Box>
          <Text color={theme.welcome.subtitle} dimColor>
            Press Enter to save, Esc to go back
          </Text>
        </Box>
      )}

      {step === 'complete' && (
        <Box flexDirection="column" alignItems="center" marginTop={2}>
          <Text color={theme.tokens.green}>Configuration saved successfully!</Text>
        </Box>
      )}
    </Box>
  );
}
