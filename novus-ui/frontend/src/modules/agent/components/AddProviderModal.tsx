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
import { useProviderStore } from '@/store/useProviderStore';
import { fetchGithubCopilotKey } from '@/lib/github';

const PROVIDER_OPTIONS = ['OpenAI', 'Anthropic', 'Cohere', 'Azure', 'GitHub'];

interface AddProviderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddProviderModal({ open, onOpenChange }: AddProviderModalProps) {
  const { addProvider } = useProviderStore();
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderKey, setNewProviderKey] = useState('');
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleSubmit = () => {
    if (!newProviderName) return;
    addProvider({ id: Date.now().toString(), name: newProviderName, apiKey: newProviderKey });
    setNewProviderName('');
    setNewProviderKey('');
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
      if (newProviderName === 'GitHub') {
        addProvider({
          id: Date.now().toString(),
          name: 'GitHub',
          apiKey: token
        });
        setNewProviderName('');
        setNewProviderKey('');
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
    setNewProviderKey('');
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
            <Label htmlFor="provider">Provider</Label>
            <Select
              value={newProviderName}
              onValueChange={setNewProviderName}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="apiKey">API Key</Label>
            <div className="flex gap-2">
              <Input
                id="apiKey"
                type="password"
                className="flex-1"
                value={newProviderKey}
                onChange={e => setNewProviderKey(e.target.value)}
                placeholder="Enter API key"
              />
              {newProviderName === 'GitHub' && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGithubAuth}
                  disabled={isAuthenticating}
                >
                  {isAuthenticating ? 'Authenticating...' : 'Get Token'}
                </Button>
              )}
            </div>
            {newProviderName === 'GitHub' && (
              <p className="text-sm text-muted-foreground">
                Click "Get Token" to authenticate with GitHub and get an access token.
                This will be a GitHub API token, not a Copilot token, as the Copilot API is not publicly available.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!newProviderName}>
            Add Provider
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}