import { useState } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sun,
  Moon,
  Monitor,
  Droplet,
  GlassWater,
  MessageSquare,
  Eye,
  Upload,
} from 'lucide-react';
import type { UserPreferences } from '@/store/useUserPreferenceStore';
import { useUserPreferenceStore } from '@/store/useUserPreferenceStore';
import { useProviderStore } from '@/store/useProviderStore';
import { useAgentStore } from '@/store/useAgentStore';
import { useModelsStore } from '@/store/useModelsStore';
import { useTheme } from '@/lib/theme';
import { callApp } from '@/lib/wails-call';

interface GeneralSettingsProps {
  settings: UserPreferences;
  onSettingsChange: (settings: Partial<UserPreferences>) => void;
}

export function GeneralSettings({
  settings,
  onSettingsChange,
}: GeneralSettingsProps) {
  const { resolvedTheme } = useTheme();
  const [importStatus, setImportStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  const exportSettings = () => {
    // Get all settings from stores
    const userPreferences = useUserPreferenceStore.getState().preferences;
    const providers = useProviderStore.getState().providers;
    const agents = useAgentStore.getState().agents;
    const models = useModelsStore.getState().models;
    
    const exportData = {
      version: '1.0.0',
      exportDate: new Date().toISOString(),
      userPreferences,
      providers,
      agents,
      enabledModels: models,
    };

    // Create and download the file
    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `nuvin-settings-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const importSettings = async (file: File) => {
    try {
      setImportStatus({ type: null, message: '' });
      
      // Read file content
      const fileContent = await file.text();
      const importData = JSON.parse(fileContent);
      
      // Validate the import data structure
      if (!importData.version || !importData.userPreferences) {
        throw new Error('Invalid settings file format');
      }
      
      // Get store instances
      const userPreferenceStore = useUserPreferenceStore.getState();
      const providerStore = useProviderStore.getState();
      const agentStore = useAgentStore.getState();
      const modelsStore = useModelsStore.getState();
      
      // Import user preferences
      if (importData.userPreferences) {
        userPreferenceStore.updatePreferences(importData.userPreferences);
      }
      
      // Import providers
      if (importData.providers && Array.isArray(importData.providers)) {
        // Clear existing providers and add imported ones
        providerStore.reset();
        for (const provider of importData.providers) {
          try {
            providerStore.addProvider(provider);
          } catch (error) {
            console.warn('Failed to import provider:', provider.name, error);
          }
        }
      }
      
      // Import agents
      if (importData.agents && Array.isArray(importData.agents)) {
        // Clear existing agents and add imported ones
        agentStore.reset();
        for (const agent of importData.agents) {
          try {
            agentStore.addAgent(agent);
          } catch (error) {
            console.warn('Failed to import agent:', agent.name, error);
          }
        }
      }
      
      // Import models/enabled states
      if (importData.enabledModels) {
        // Reset models store and set imported model states
        modelsStore.reset();
        for (const [providerId, models] of Object.entries(importData.enabledModels)) {
          if (Array.isArray(models)) {
            try {
              modelsStore.setModels(providerId, models as any);
            } catch (error) {
              console.warn('Failed to import models for provider:', providerId, error);
            }
          }
        }
      }
      
      setImportStatus({
        type: 'success',
        message: 'Settings imported successfully! The page will refresh to apply changes.'
      });
      
      // Refresh the page after a short delay to ensure all stores are updated
      setTimeout(() => {
        window.location.reload();
      }, 2000);
      
    } catch (error) {
      console.error('Failed to import settings:', error);
      setImportStatus({
        type: 'error',
        message: `Failed to import settings: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type === 'application/json' || file.name.endsWith('.json')) {
        importSettings(file);
      } else {
        setImportStatus({
          type: 'error',
          message: 'Please select a valid JSON file'
        });
      }
    }
    // Reset the input value so the same file can be selected again
    event.target.value = '';
  };

  return (
    <div>
      <div className="p-6 border-b">
        <h2 className="text-xl font-semibold">General Settings</h2>
      </div>
      <div className="p-6 space-y-6 overflow-y-auto">
        {/* Settings Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Settings Column */}
          <div className="space-y-6">
            {/* Theme Setting */}
            <div className="grid gap-2">
              <Label htmlFor="theme">Theme</Label>
              <Select
                value={settings.theme}
                onValueChange={(
                  value: 'light' | 'dark' | 'ocean' | 'liquid-glass' | 'system',
                ) => onSettingsChange({ theme: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select theme">
                    <div className="flex items-center gap-2">
                      {settings.theme === 'light' && (
                        <Sun className="h-4 w-4" />
                      )}
                      {settings.theme === 'dark' && (
                        <Moon className="h-4 w-4" />
                      )}
                      {settings.theme === 'ocean' && (
                        <Droplet className="h-4 w-4" />
                      )}
                      {settings.theme === 'liquid-glass' && (
                        <GlassWater className="h-4 w-4" />
                      )}
                      {settings.theme === 'system' && (
                        <Monitor className="h-4 w-4" />
                      )}
                      <span className="capitalize">{settings.theme}</span>
                      {settings.theme === 'system' && (
                        <span className="text-muted-foreground text-xs">
                          ({resolvedTheme})
                        </span>
                      )}
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">
                    <div className="flex items-center gap-2">
                      <Sun className="h-4 w-4" />
                      <span>Light</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="dark">
                    <div className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      <span>Dark</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="ocean">
                    <div className="flex items-center gap-2">
                      <Droplet className="h-4 w-4" />
                      <span>Ocean</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="liquid-glass">
                    <div className="flex items-center gap-2">
                      <GlassWater className="h-4 w-4" />
                      <span>Liquid Glass</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="system">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-4 w-4" />
                      <span>System</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Message Mode Setting */}
            <div className="grid gap-2">
              <Label htmlFor="messageMode">Message Mode</Label>
              <Select
                value={settings.messageMode}
                onValueChange={(value: 'normal' | 'transparent') =>
                  onSettingsChange({ messageMode: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select message mode">
                    <div className="flex items-center gap-2">
                      {settings.messageMode === 'normal' && (
                        <MessageSquare className="h-4 w-4" />
                      )}
                      {settings.messageMode === 'transparent' && (
                        <Eye className="h-4 w-4" />
                      )}
                      <span className="capitalize">{settings.messageMode}</span>
                    </div>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      <span>Normal</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="transparent">
                    <div className="flex items-center gap-2">
                      <Eye className="h-4 w-4" />
                      <span>Transparent</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Import/Export Settings Section */}
        <div className="space-y-4 pt-4 border-t">
          <h3 className="text-lg font-medium">Settings Management</h3>
          
          {/* Import Settings */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Import Settings</Label>
            <div className="flex items-center gap-2">
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                style={{ display: 'none' }}
                id="settings-import"
              />
              <label htmlFor="settings-import">
                <Button type="button" variant="outline">
                  <Upload className="h-4 w-4 mr-2" />
                  Import Settings
                </Button>
              </label>
            </div>
          </div>
          
          {/* Import Status Message */}
          {importStatus.type && (
            <div className={`p-3 rounded-md text-sm ${
              importStatus.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {importStatus.message}
            </div>
          )}
          
          {/* Export Settings */}
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">Export Settings</Label>
            <Button type="button" onClick={exportSettings}>
              Export All Settings
            </Button>
          </div>
        </div>

        {/* Application Update Section */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Label className="text-sm font-medium">Application Update</Label>
          <Button type="button" onClick={() => void callApp('CheckForUpdates')}>
            Check for Updates
          </Button>
        </div>
      </div>
    </div>
  );
}
