import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserPreferences } from '@/store/useUserPreferenceStore';

interface GeneralSettingsProps {
  settings: UserPreferences;
  onSettingsChange: (settings: Partial<UserPreferences>) => void;
}

export function GeneralSettings({ settings, onSettingsChange }: GeneralSettingsProps) {
  return (
    <div className="grid gap-6 overflow-y-auto">
      {/* Theme Setting */}
      <div className="grid gap-2">
        <Label htmlFor="theme">Theme</Label>
        <Select
          value={settings.theme}
          onValueChange={(value: 'light' | 'dark' | 'system') =>
            onSettingsChange({ theme: value })
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
            onSettingsChange({ fontSize: value })
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
            onSettingsChange({ notifications: !settings.notifications })
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
            onSettingsChange({ autoSave: !settings.autoSave })
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
  );
}