import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProviderStore } from '@/store/useProviderStore';
import { fetchGithubCopilotKey } from '@/lib/github';

const PROVIDER_OPTIONS = ['OpenAI', 'Anthropic', 'Cohere', 'Azure', 'GitHub'];

interface ProviderSettingsProps {
  onAddProvider: () => void;
}

export function ProviderSettings({ onAddProvider }: ProviderSettingsProps) {
  const { providers, updateProvider, deleteProvider } = useProviderStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editKey, setEditKey] = useState('');

  return (
    <div className="flex flex-1 flex-col gap-4">
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
      <div className="flex-1 flex flex-col">
        <div className="font-medium text-sm mb-3 flex-shrink-0">
          Existing Providers ({providers.length})
        </div>
        <div className="flex flex-col flex-1 overflow-y-auto border rounded-lg bg-muted/20">
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
                      <span className="text-xs text-muted-foreground">
                        {provider.apiKey ? 'Key added' : 'No key'}
                      </span>
                    </div>
                    <div className="flex gap-2 flex-shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingId(provider.id);
                          setEditName(provider.name);
                          setEditKey(provider.apiKey);
                        }}
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
                      <Label>Provider</Label>
                      <Select value={editName} onValueChange={setEditName}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select provider" />
                        </SelectTrigger>
                        <SelectContent>
                          {PROVIDER_OPTIONS.map(name => (
                            <SelectItem key={name} value={name}>{name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Label>API Key</Label>
                      <div className="flex gap-2">
                        <Input
                          type="password"
                          className="flex-1"
                          value={editKey}
                          onChange={e => setEditKey(e.target.value)}
                          placeholder="Enter API key"
                        />
                        {editName === 'GitHub' && (
                          <Button type="button" variant="outline" size="sm" onClick={async () => {
                            const key = await fetchGithubCopilotKey();
                            if (!key || !editingId) return;
                            setEditKey(key);
                            updateProvider({ id: editingId, name: editName, apiKey: key });
                          }}>
                            Get Key
                          </Button>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            if (!editingId) return;
                            updateProvider({ id: editingId, name: editName, apiKey: editKey });
                            setEditingId(null);
                            setEditName('');
                            setEditKey('');
                          }}
                        >
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingId(null)}
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