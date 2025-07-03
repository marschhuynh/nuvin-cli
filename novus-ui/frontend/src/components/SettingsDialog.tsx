import { useState } from 'react';
import { Settings } from 'lucide-react';
import { ProviderConfig } from '@/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  apiEndpoint: string;
  apiKey: string;
  notifications: boolean;
  autoSave: boolean;
  fontSize: 'small' | 'medium' | 'large';
  providers: ProviderConfig[];
}


const PROVIDER_OPTIONS = ['OpenAI', 'Anthropic', 'Cohere', 'Azure'];

export function SettingsDialog() {
  const [settings, setSettings] = useState<AppSettings>({
    theme: 'system',
    apiEndpoint: 'https://api.example.com',
    apiKey: '',
    notifications: true,
    autoSave: true,
    fontSize: 'medium',
    providers: [
      { id: 'default', name: 'OpenAI', apiKey: '' }
    ]
  });
  const [activeTab, setActiveTab] = useState<'general' | 'provider'>('general');
  const [newProviderName, setNewProviderName] = useState('');
  const [newProviderKey, setNewProviderKey] = useState('');

  const handleSave = () => {
    // In a real app, this would save settings to storage or send to backend
    console.log('Settings saved:', settings);
  };

  const handleReset = () => {
    setSettings({
      theme: 'system',
      apiEndpoint: 'https://api.example.com',
      apiKey: '',
      notifications: true,
      autoSave: true,
      fontSize: 'medium',
      providers: [
        { id: 'default', name: 'OpenAI', apiKey: '' }
      ]
    });
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
          <Settings className="h-4 w-4" />
          <span className="sr-only">Settings</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure your application preferences and settings.
          </DialogDescription>
        </DialogHeader>

        <div>
          <div className="mb-4 border-b">
            <nav className="flex space-x-4">
              <button
                className={`pb-2 text-sm font-medium ${
                  activeTab === 'general' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'
                }`}
                onClick={() => setActiveTab('general')}
              >
                General
              </button>
              <button
                className={`pb-2 text-sm font-medium ${
                  activeTab === 'provider' ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground'
                }`}
                onClick={() => setActiveTab('provider')}
              >
                Provider
              </button>
            </nav>
          </div>

          {activeTab === 'general' && (
            <div className="grid gap-6 py-4">
              {/* Theme Setting */}
              <div className="grid gap-2">
                <Label htmlFor="theme">Theme</Label>
                <Select
                  value={settings.theme}
                  onValueChange={(value: 'light' | 'dark' | 'system') =>
                    setSettings(prev => ({ ...prev, theme: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select theme" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">Light</SelectItem>
                    <SelectItem value="dark">Dark</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Font Size Setting */}
              <div className="grid gap-2">
                <Label htmlFor="fontSize">Font Size</Label>
                <Select
                  value={settings.fontSize}
                  onValueChange={(value: 'small' | 'medium' | 'large') =>
                    setSettings(prev => ({ ...prev, fontSize: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select font size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="large">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* API Endpoint */}
              <div className="grid gap-2">
                <Label htmlFor="apiEndpoint">API Endpoint</Label>
                <Input
                  id="apiEndpoint"
                  type="url"
                  value={settings.apiEndpoint}
                  onChange={e =>
                    setSettings(prev => ({ ...prev, apiEndpoint: e.target.value }))
                  }
                  placeholder="https://api.example.com"
                />
              </div>

              {/* API Key */}
              <div className="grid gap-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={settings.apiKey}
                  onChange={e =>
                    setSettings(prev => ({ ...prev, apiKey: e.target.value }))
                  }
                  placeholder="Enter your API key"
                />
              </div>

              {/* Notifications Toggle */}
              <div className="flex items-center justify-between">
                <Label htmlFor="notifications" className="text-sm font-medium">
                  Enable Notifications
                </Label>
                <button
                  type="button"
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                    settings.notifications ? 'bg-primary' : 'bg-input'
                  }`}
                  onClick={() =>
                    setSettings(prev => ({ ...prev, notifications: !prev.notifications }))
                  }
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                      settings.notifications ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Auto Save Toggle */}
              <div className="flex items-center justify-between">
                <Label htmlFor="autoSave" className="text-sm font-medium">
                  Auto Save Conversations
                </Label>
                <button
                  type="button"
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                    settings.autoSave ? 'bg-primary' : 'bg-input'
                  }`}
                  onClick={() =>
                    setSettings(prev => ({ ...prev, autoSave: !prev.autoSave }))
                  }
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                      settings.autoSave ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {activeTab === 'provider' && (
            <div className="grid gap-4 py-4 max-h-60 overflow-y-auto">
              {settings.providers.map(provider => (
                <div key={provider.id} className="rounded-md border p-3">
                  <div className="font-medium flex justify-between items-center">
                    <span>{provider.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {provider.apiKey ? 'Key added' : 'No key'}
                    </span>
                  </div>
                </div>
              ))}
              <div className="rounded-md border p-3 space-y-2">
                <Label>Provider</Label>
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
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={newProviderKey}
                  onChange={e => setNewProviderKey(e.target.value)}
                  placeholder="Enter API key"
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (!newProviderName) return;
                    setSettings(prev => ({
                      ...prev,
                      providers: [
                        ...prev.providers,
                        { id: Date.now().toString(), name: newProviderName, apiKey: newProviderKey }
                      ]
                    }));
                    setNewProviderName('');
                    setNewProviderKey('');
                  }}
                >
                  Add Provider
                </Button>
              </div>
            </div>
          )}
        </div>

        {activeTab === 'general' && (
          <DialogFooter>
            <Button variant="outline" onClick={handleReset}>
              Reset to Defaults
            </Button>
            <Button onClick={handleSave}>Save Changes</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
