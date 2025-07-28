import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Eye,
  EyeOff,
  Wifi,
  CheckCircle,
  XCircle,
  AlertCircle,
} from 'lucide-react';
import { useProviderStore } from '@/store/useProviderStore';
import { fetchGithubCopilotKey } from '@/lib/github';
import {
  getDefaultModel,
  fetchProviderModels,
  type ProviderType,
  PROVIDER_TYPES,
} from '@/lib/providers/provider-utils';
import { useModelsStore } from '@/store/useModelsStore';
import type { ProviderConfig } from '@/types';
import { PROVIDER_METADATA } from '@/lib/providers/const';

const PROVIDER_OPTIONS = [
  PROVIDER_TYPES.OpenAI,
  PROVIDER_TYPES.Anthropic,
  PROVIDER_TYPES.OpenRouter,
  PROVIDER_TYPES.GitHub,
  PROVIDER_TYPES.OpenAICompatible,
  PROVIDER_TYPES.DeepInfra,
];

interface ProviderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider?: ProviderConfig | null;
  mode: 'add' | 'edit';
}

export function ProviderModal({
  open,
  onOpenChange,
  provider = null,
  mode,
}: ProviderModalProps) {
  const { addProvider, updateProvider, isNameUnique, setActiveProvider } =
    useProviderStore();
  const { fetchModels, setModels } = useModelsStore();
  const [providerName, setProviderName] = useState('');
  const [providerType, setProviderType] = useState<PROVIDER_TYPES>(
    PROVIDER_TYPES.OpenAI,
  );
  const [providerKey, setProviderKey] = useState('');
  const [providerApiUrl, setProviderApiUrl] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [nameError, setNameError] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    'idle' | 'success' | 'error'
  >('idle');
  const [connectionMessage, setConnectionMessage] = useState('');

  useEffect(() => {
    if (mode === 'edit' && provider && open) {
      setProviderName(provider.name);
      setProviderType(provider.type || provider.name);
      setProviderKey(provider.apiKey);
      setProviderApiUrl(provider.apiUrl || '');
      setSelectedModel('');
      setNameError('');
      setShowApiKey(false);
    } else if (mode === 'add') {
      setProviderName('');
      setProviderType(PROVIDER_TYPES.OpenAI);
      setProviderKey('');
      setProviderApiUrl('');
      setSelectedModel('');
      setNameError('');
      setShowApiKey(false);
      setConnectionStatus('idle');
      setConnectionMessage('');
    }
  }, [provider, open, mode]);

  const validateName = (name: string) => {
    if (!name.trim()) {
      setNameError('Name is required');
      return false;
    }
    if (
      !isNameUnique(name.trim(), mode === 'edit' ? provider?.id : undefined)
    ) {
      setNameError('Name must be unique');
      return false;
    }
    setNameError('');
    return true;
  };

  const handleNameChange = (name: string) => {
    setProviderName(name);
    if (name) {
      validateName(name);
    } else {
      setNameError('');
    }
  };

  const handleProviderTypeChange = (value: PROVIDER_TYPES) => {
    setProviderType(value);
    setSelectedModel('');
  };

  const handleSubmit = async () => {
    if (!validateName(providerName) || !providerType) return;

    if (mode === 'edit' && provider) {
      updateProvider({
        id: provider.id,
        name: providerName.trim(),
        type: providerType,
        apiKey: providerKey,
        apiUrl:
          providerType === PROVIDER_TYPES.OpenAICompatible
            ? providerApiUrl
            : undefined,
        activeModel: provider.activeModel || {
          model: 'gpt-3.5-turbo',
          maxTokens: 2048,
        },
      });
    } else {
      const newProviderId = Date.now().toString();
      const newProvider = {
        id: newProviderId,
        name: providerName.trim(),
        type: providerType as PROVIDER_TYPES,
        apiKey: providerKey,
        apiUrl:
          providerType === PROVIDER_TYPES.OpenAICompatible
            ? providerApiUrl
            : undefined,
        activeModel: {
          model: selectedModel || getDefaultModel(providerType as ProviderType),
          maxTokens: 2048,
        },
      };

      addProvider(newProvider);
      setActiveProvider(newProviderId);

      if (providerKey) {
        fetchModels(newProvider);

        // try {
        //   const fetchedModels = await fetchProviderModels({
        //     type: providerType as ProviderType,
        //     apiKey: providerKey,
        //     name: providerName.trim(),
        //     apiUrl:
        //       providerType === PROVIDER_TYPES.OpenAICompatible
        //         ? providerApiUrl
        //         : undefined,
        //   });
        //   setModels(newProviderId, fetchedModels);
        // } catch (error) {
        //   console.error('Failed to fetch models for new provider:', error);
        // }
      }
    }

    handleClose();
  };

  const handleGithubAuth = async () => {
    setIsAuthenticating(true);
    try {
      const token = await fetchGithubCopilotKey();
      if (!token) {
        console.error('Failed to get GitHub token');
        return;
      }

      setProviderKey(token);

      if (
        providerType === PROVIDER_TYPES.GitHub &&
        validateName(providerName) &&
        mode === 'add'
      ) {
        const newProviderId = Date.now().toString();
        const newProvider = {
          id: newProviderId,
          name: providerName.trim(),
          type: PROVIDER_TYPES.GitHub,
          apiKey: token,
          activeModel: {
            model: selectedModel || getDefaultModel(PROVIDER_TYPES.GitHub),
            maxTokens: 2048,
          },
        };

        addProvider(newProvider);
        setActiveProvider(newProviderId);

        try {
          const fetchedModels = await fetchProviderModels({
            type: PROVIDER_TYPES.GitHub,
            apiKey: token,
            name: providerName.trim(),
          });
          setModels(newProviderId, fetchedModels);
        } catch (error) {
          console.error(
            'Failed to fetch models for new GitHub provider:',
            error,
          );
        }

        handleClose();
      }
    } catch (error) {
      console.error('GitHub authentication failed:', error);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const parseErrorMessage = (error: any): string => {
    if (typeof error === 'string') return error;

    // Handle OpenAI API errors
    if (error?.message) {
      const message = error.message;
      if (message.includes('401')) {
        return 'Invalid API key. Please check your API key and try again.';
      }
      if (message.includes('403')) {
        return 'Access forbidden. Please verify your API key permissions.';
      }
      if (message.includes('429')) {
        return 'Rate limit exceeded. Please try again later.';
      }
      if (message.includes('500')) {
        return 'Server error. Please try again later.';
      }
      return message;
    }

    return 'Connection failed. Please check your configuration.';
  };

  const testConnection = async () => {
    if (!providerKey || !providerType) {
      setConnectionStatus('error');
      setConnectionMessage('Please enter an API key first');
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('idle');
    setConnectionMessage('');

    try {
      // Test connection by fetching models
      const testModels = await fetchProviderModels({
        type: providerType as ProviderType,
        apiKey: providerKey,
        name: providerName || 'Test',
        apiUrl:
          providerType === PROVIDER_TYPES.OpenAICompatible
            ? providerApiUrl
            : undefined,
      });

      if (testModels && testModels.length > 0) {
        setConnectionStatus('success');
        setConnectionMessage(
          `Connection successful! Found ${testModels.length} model${testModels.length === 1 ? '' : 's'}.`,
        );
      } else {
        setConnectionStatus('error');
        setConnectionMessage('Connection successful but no models found.');
      }
    } catch (error) {
      setConnectionStatus('error');
      setConnectionMessage(parseErrorMessage(error));
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleClose = () => {
    setProviderName('');
    setProviderType(PROVIDER_TYPES.OpenAI);
    setProviderKey('');
    setProviderApiUrl('');
    setSelectedModel('');
    setNameError('');
    setShowApiKey(false);
    setConnectionStatus('idle');
    setConnectionMessage('');
    onOpenChange(false);
  };

  const isFormValid = providerName && providerType && nameError === '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[500px] max-h-[90vh] flex flex-col"
        style={{
          top: 'calc(100vh / 1.618 - 45vh)',
          transform: 'translateY(50%)',
          bottom: 'auto',
          transition: 'all 0.8s ease-in-out',
        }}
      >
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>
            {mode === 'add' ? 'Add New Provider' : 'Edit Provider'}
          </DialogTitle>
          {mode === 'add' && (
            <DialogDescription>
              Add a new AI provider to your configuration.
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="flex-1 overflow-y-auto">
          <div className="grid gap-4 py-4 px-1">
            <div className="grid gap-2">
              <Label htmlFor="providerName">Provider Name</Label>
              <Input
                id="providerName"
                value={providerName}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="Enter a unique name for this provider"
                className={nameError ? 'border-red-500' : ''}
              />
              {nameError && <p className="text-sm text-red-500">{nameError}</p>}
              <p className="text-xs text-muted-foreground">
                This name will help you identify this provider configuration
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="providerType">Provider Type</Label>
              <Select
                value={providerType}
                onValueChange={handleProviderTypeChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select provider type" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PROVIDER_METADATA[type].name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {providerType === PROVIDER_TYPES.OpenAICompatible && (
              <div className="grid gap-2">
                <Label htmlFor="apiUrl">API URL</Label>
                <Input
                  id="apiUrl"
                  type="url"
                  value={providerApiUrl}
                  onChange={(e) => setProviderApiUrl(e.target.value)}
                  placeholder="https://api.openai.com"
                />
                <p className="text-xs text-muted-foreground">
                  The base URL of your OpenAI-compatible API endpoint
                </p>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="apiKey">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="apiKey"
                    type={showApiKey ? 'text' : 'password'}
                    className="pr-10"
                    value={providerKey}
                    onChange={(e) => {
                      setProviderKey(e.target.value);
                      setConnectionStatus('idle');
                      setConnectionMessage('');
                    }}
                    placeholder="Enter API key"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {providerType === PROVIDER_TYPES.GitHub && (
                  <Button
                    type="button"
                    variant="outline"
                    size={mode === 'edit' ? 'sm' : undefined}
                    onClick={handleGithubAuth}
                    disabled={
                      isAuthenticating || !providerName || nameError !== ''
                    }
                  >
                    {isAuthenticating
                      ? 'Authenticating...'
                      : mode === 'edit'
                        ? 'Get Key'
                        : 'Get Token'}
                  </Button>
                )}
              </div>

              {/* Connection Status */}
              {connectionStatus !== 'idle' && (
                <div
                  className={`mt-3 p-3 rounded-lg border flex items-start gap-2 ${
                    connectionStatus === 'success'
                      ? 'bg-green-50 border-green-200 text-green-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {connectionStatus === 'success' ? (
                    <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-600 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1">
                    <p className="font-medium text-sm">
                      {connectionStatus === 'success'
                        ? 'Connection Successful'
                        : 'Connection Failed'}
                    </p>
                    <p className="text-sm mt-1 opacity-90">
                      {connectionMessage}
                    </p>
                  </div>
                </div>
              )}

              {providerType === PROVIDER_TYPES.GitHub && mode === 'add' && (
                <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-blue-800">
                      Click "Get Token" to authenticate with GitHub and get an
                      access token. This will be a GitHub API token, not a
                      Copilot token, as the Copilot API is not publicly
                      available.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <DialogFooter className="flex-shrink-0 border-t pt-4">
          <div className="flex items-center justify-between w-full">
            <Button
              type="button"
              variant="outline"
              onClick={testConnection}
              disabled={isTestingConnection || !providerKey || !providerType}
              className="flex items-center gap-2"
            >
              <Wifi
                className={`h-4 w-4 ${isTestingConnection ? 'animate-pulse' : ''}`}
              />
              {isTestingConnection ? 'Testing...' : 'Test Connection'}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!isFormValid}>
                {mode === 'add' ? 'Add Provider' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
