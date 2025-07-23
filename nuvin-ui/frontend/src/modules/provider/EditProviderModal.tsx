import { useState, useEffect } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import {
  Dialog,
  DialogContent,
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
import { useProviderStore } from '@/store/useProviderStore';
import { fetchGithubCopilotKey } from '@/lib/github';
import { PROVIDER_TYPES } from '@/lib/providers/provider-utils';

const PROVIDER_OPTIONS = [
  PROVIDER_TYPES.OpenAI,
  PROVIDER_TYPES.Anthropic,
  PROVIDER_TYPES.OpenRouter,
  PROVIDER_TYPES.GitHub,
];

console.log(
  'EditProviderModal loaded',
  PROVIDER_OPTIONS.map((type) => type.toString()),
  PROVIDER_TYPES.OpenAI,
);

interface EditProviderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  provider: any | null;
}

export function EditProviderModal({
  open,
  onOpenChange,
  provider,
}: EditProviderModalProps) {
  const { updateProvider, isNameUnique } = useProviderStore();
  const [editName, setEditName] = useState(PROVIDER_TYPES.OpenAI);
  const [editType, setEditType] = useState(PROVIDER_TYPES.OpenAI);
  const [editKey, setEditKey] = useState('');
  const [nameError, setNameError] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (provider && open) {
      setEditName(provider.name);
      setEditType(provider.type || provider.name);
      setEditKey(provider.apiKey);
      setNameError('');
      setShowApiKey(false);
    }
  }, [provider, open]);

  const validateEditName = (name: string) => {
    if (!name.trim()) {
      setNameError('Name is required');
      return false;
    }
    if (!isNameUnique(name.trim(), provider?.id)) {
      setNameError('Name must be unique');
      return false;
    }
    setNameError('');
    return true;
  };

  const handleEditNameChange = (name: string) => {
    setEditName(name);
    if (name) {
      validateEditName(name);
    } else {
      setNameError('');
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setEditName('');
    setEditType(PROVIDER_TYPES.OpenAI);
    setEditKey('');
    setNameError('');
    setShowApiKey(false);
  };

  const saveChanges = () => {
    if (!provider || !validateEditName(editName) || !editType) return;

    updateProvider({
      id: provider.id,
      name: editName.trim(),
      type: editType,
      apiKey: editKey,
      activeModel: provider.activeModel || {
        model: 'gpt-3.5-turbo',
        maxTokens: 2048,
      },
    });
    handleClose();
  };

  if (!provider) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Provider</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="provider-name">Provider Name</Label>
            <Input
              id="provider-name"
              value={editName}
              onChange={(e) => handleEditNameChange(e.target.value)}
              placeholder="Enter a unique name for this provider"
              className={nameError ? 'border-red-500' : ''}
            />
            {nameError && (
              <p className="text-sm text-red-500 mt-1">{nameError}</p>
            )}
          </div>

          <div>
            <Label htmlFor="provider-type">Provider Type</Label>
            <Select value={editType} onValueChange={setEditType as any}>
              <SelectTrigger>
                <SelectValue placeholder="Select provider type" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDER_OPTIONS.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="api-key">API Key</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="api-key"
                  type={showApiKey ? 'text' : 'password'}
                  className="pr-10"
                  value={editKey}
                  onChange={(e) => setEditKey(e.target.value)}
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
              {editType === PROVIDER_TYPES.GitHub && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const key = await fetchGithubCopilotKey();
                    if (key) {
                      setEditKey(key);
                    }
                  }}
                >
                  Get Key
                </Button>
              )}
            </div>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={saveChanges}
              disabled={!editName || !editType || nameError !== ''}
              className="flex-1"
            >
              Save Changes
            </Button>
            <Button variant="outline" onClick={handleClose} className="flex-1">
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
