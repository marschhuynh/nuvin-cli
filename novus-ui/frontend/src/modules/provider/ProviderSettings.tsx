import { useState } from 'react';
import { Plus, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProviderStore } from '@/store/useProviderStore';
import { fetchGithubCopilotKey } from '@/lib/github';

const PROVIDER_OPTIONS = ['OpenAI', 'Anthropic', 'GitHub'];

interface ProviderSettingsProps {
  onAddProvider: () => void;
}

export function ProviderSettings({ onAddProvider }: ProviderSettingsProps) {
  const { providers, updateProvider, deleteProvider, isNameUnique } = useProviderStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState('');
  const [editKey, setEditKey] = useState('');
  const [nameError, setNameError] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  const validateEditName = (name: string, excludeId: string) => {
    if (!name.trim()) {
      setNameError('Name is required');
      return false;
    }
    if (!isNameUnique(name.trim(), excludeId)) {
      setNameError('Name must be unique');
      return false;
    }
    setNameError('');
    return true;
  };

  const handleEditNameChange = (name: string) => {
    setEditName(name);
    if (editingId) {
      if (name) {
        validateEditName(name, editingId);
      } else {
        setNameError('');
      }
    }
  };

  const startEditing = (provider: any) => {
    setEditingId(provider.id);
    setEditName(provider.name);
    setEditType(provider.type || provider.name); // Fallback for old data structure
    setEditKey(provider.apiKey);
    setNameError('');
    setShowApiKey(false);
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditName('');
    setEditType('');
    setEditKey('');
    setNameError('');
    setShowApiKey(false);
  };

  const saveChanges = () => {
    if (!editingId || !validateEditName(editName, editingId) || !editType) return;

    updateProvider({
      id: editingId,
      name: editName.trim(),
      type: editType,
      apiKey: editKey
    });
    cancelEditing();
  };

  return (
    <div className="flex flex-1 flex-col gap-4 min-h-0">
      {/* Add Provider Button */}
      <div className="flex-shrink-0">
        <Button
          onClick={onAddProvider}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add New Provider
        </Button>
      </div>

      {/* Existing Providers - Scrollable */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="font-medium text-sm mb-3 flex-shrink-0">
          Existing Providers ({providers.length})
        </div>
        <div className="flex flex-col flex-1 overflow-auto border rounded-lg bg-muted/20">
          <div className="p-3 space-y-3 pb-6">
            {providers.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                No providers added yet
              </div>
            ) : (
              providers.map(provider => (
                <div key={provider.id} className="rounded-md border p-3 space-y-2">
                  <div className="flex justify-between items-center gap-3">
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">{provider.name}</span>
                      <span className="text-sm text-muted-foreground">
                        {provider.type || provider.name} • {provider.apiKey ? 'Key added' : 'No key'}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => startEditing(provider)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteProvider(provider.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                  {editingId === provider.id && (
                    <div className="space-y-2">
                      <Label>Provider Name</Label>
                      <Input
                        value={editName}
                        onChange={(e) => handleEditNameChange(e.target.value)}
                        placeholder="Enter a unique name for this provider"
                        className={nameError ? 'border-red-500' : ''}
                      />
                      {nameError && (
                        <p className="text-sm text-red-500">{nameError}</p>
                      )}
                      <Label>Provider Type</Label>
                      <Select value={editType} onValueChange={setEditType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select provider type" />
                        </SelectTrigger>
                        <SelectContent>
                          {PROVIDER_OPTIONS.map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Label>API Key</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showApiKey ? 'text' : 'password'}
                            className="pr-10"
                            value={editKey}
                            onChange={e => setEditKey(e.target.value)}
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
                        {editType === 'GitHub' && (
                          <Button type="button" variant="outline" size="sm" onClick={async () => {
                            const key = await fetchGithubCopilotKey();
                            if (!key || !editingId) return;
                            setEditKey(key);
                          }}>
                            Get Key
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={saveChanges}
                          disabled={!editName || !editType || nameError !== ''}
                        >
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={cancelEditing}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}