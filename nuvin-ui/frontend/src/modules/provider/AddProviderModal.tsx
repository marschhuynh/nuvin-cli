import { useState } from 'react';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, EyeOff } from 'lucide-react';
import { useProviderStore } from '@/store/useProviderStore';
import { fetchGithubCopilotKey } from '@/lib/github';
import { ModelSelector } from '@/components/ModelSelector';
import { getDefaultModel } from '@/lib/providers/provider-utils';

const PROVIDER_OPTIONS = ['OpenAI', 'Anthropic', 'OpenRouter', 'GitHub'];

interface AddProviderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddProviderModal({ open, onOpenChange }: AddProviderModalProps) {
  const { addProvider, isNameUnique } = useProviderStore();
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderType, setNewProviderType] = useState('');
  const [newProviderKey, setNewProviderKey] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [nameError, setNameError] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  const validateName = (name: string) => {
    if (!name.trim()) {
      setNameError('Name is required');
      return false;
    }
    if (!isNameUnique(name.trim())) {
      setNameError('Name must be unique');
      return false;
    }
    setNameError('');
    return true;
  };

  const handleNameChange = (name: string) => {
    setNewProviderName(name);
    if (name) {
      validateName(name);
    } else {
      setNameError('');
    }
  };

  // Reset model selection when provider type changes
  const handleProviderTypeChange = (value: string) => {
    setNewProviderType(value);
    setSelectedModel(getDefaultModel(value as any));
  };

    const handleSubmit = () => {
    if (!validateName(newProviderName) || !newProviderType) return;

    addProvider({
      id: Date.now().toString(),
      name: newProviderName.trim(),
      type: newProviderType,
      apiKey: newProviderKey,
      modelConfig: {
        model: selectedModel || getDefaultModel(newProviderType as any),
        temperature: 0.7,
        maxTokens: 2048,
        topP: 1,
        systemPrompt: ''
      }
    });

    setNewProviderName('');
    setNewProviderType('');
    setNewProviderKey('');
    setSelectedModel('');
    setNameError('');
    setShowApiKey(false);
    onOpenChange(false);
  };

  const handleGithubAuth = async () => {
    setIsAuthenticating(true);
    try {
      const token = await fetchGithubCopilotKey();
      if (!token) {
        console.error('Failed to get GitHub token');
        return;
      }

      setNewProviderKey(token);

      // If GitHub is selected, auto-add the provider
      if (newProviderType === 'GitHub' && validateName(newProviderName)) {
        addProvider({
          id: Date.now().toString(),
          name: newProviderName.trim(),
          type: 'GitHub',
          apiKey: token,
          modelConfig: {
            model: selectedModel || getDefaultModel('GitHub'),
            temperature: 0.7,
            maxTokens: 2048,
            topP: 1,
            systemPrompt: ''
          }
        });
        setNewProviderName('');
        setNewProviderType('');
        setNewProviderKey('');
        setSelectedModel('');
        setNameError('');
        setShowApiKey(false);
        onOpenChange(false);
      }
    } catch (error) {
      console.error('GitHub authentication failed:', error);
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleCancel = () => {
    setNewProviderName('');
    setNewProviderType('');
    setNewProviderKey('');
    setSelectedModel('');
    setNameError('');
    setShowApiKey(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add New Provider</DialogTitle>
          <DialogDescription>
            Add a new AI provider to your configuration.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="providerName">Provider Name</Label>
            <Input
              id="providerName"
              value={newProviderName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Enter a unique name for this provider"
              className={nameError ? 'border-red-500' : ''}
            />
            {nameError && (
              <p className="text-sm text-red-500">{nameError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              This name will help you identify this provider configuration
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="providerType">Provider Type</Label>
            <Select
              value={newProviderType}
              onValueChange={handleProviderTypeChange}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider type" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map(type => (
                  <SelectItem key={type} value={type}>{type}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="apiKey"
                  type={showApiKey ? 'text' : 'password'}
                  className="pr-10"
                  value={newProviderKey}
                  onChange={e => setNewProviderKey(e.target.value)}
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
              {newProviderType === 'GitHub' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGithubAuth}
                  disabled={isAuthenticating || !newProviderName || nameError !== ''}
                >
                  {isAuthenticating ? 'Authenticating...' : 'Get Token'}
                </Button>
              )}
            </div>
            {newProviderType === 'GitHub' && (
              <p className="text-sm text-muted-foreground">
                Click "Get Token" to authenticate with GitHub and get an access token.
                This will be a GitHub API token, not a Copilot token, as the Copilot API is not publicly available.
              </p>
            )}
          </div>
          
          {/* Model Selection */}
          {newProviderType && newProviderKey && (
            <div className="grid gap-2">
              <Label htmlFor="model">Select Model</Label>
              <ModelSelector
                providerConfig={{
                  type: newProviderType as any,
                  apiKey: newProviderKey,
                  name: newProviderName || 'New Provider'
                }}
                selectedModel={selectedModel}
                onModelSelect={setSelectedModel}
                showDetails={false}
              />
              <p className="text-sm text-muted-foreground">
                Available models will be fetched from the provider when you enter a valid API key.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!newProviderName || !newProviderType || nameError !== ''}
          >
            Add Provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}