import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Sun, Moon, Monitor, Droplet } from 'lucide-react';
import type { UserPreferences } from '@/store/useUserPreferenceStore';
import { useTheme } from '@/lib/theme';

interface GeneralSettingsProps {
  settings: UserPreferences;
  onSettingsChange: (settings: Partial<UserPreferences>) => void;
}

export function GeneralSettings({
  settings,
  onSettingsChange,
}: GeneralSettingsProps) {
  const { resolvedTheme } = useTheme();

  return (
    <div>
      <div className="p-6 border-b">
        <h2 className="text-xl font-semibold">General Settings</h2>
      </div>
      <div className="p-6 grid gap-6 overflow-y-auto">
        {/* Theme Setting */}
        <div className="grid gap-2">
          <Label htmlFor="theme">Theme</Label>
          <Select
            value={settings.theme}
            onValueChange={(value: 'light' | 'dark' | 'ocean' | 'system') =>
              onSettingsChange({ theme: value })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select theme">
                <div className="flex items-center gap-2">
                  {settings.theme === 'light' && <Sun className="h-4 w-4" />}
                  {settings.theme === 'dark' && <Moon className="h-4 w-4" />}
                  {settings.theme === 'ocean' && <Droplet className="h-4 w-4" />}
                  {settings.theme === 'system' && <Monitor className="h-4 w-4" />}
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
              <SelectItem value="system">
                <div className="flex items-center gap-2">
                  <Monitor className="h-4 w-4" />
                  <span>System</span>
                </div>
              </SelectItem>
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
            onClick={() => onSettingsChange({ autoSave: !settings.autoSave })}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-background transition-transform ${
                settings.autoSave ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
