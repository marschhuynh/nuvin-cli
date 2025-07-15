import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
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
import { CheckForUpdates } from '../../../wailsjs/go/main/App';

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
        {/* Check for Updates */}
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">Application Update</Label>
          <Button type="button" onClick={() => CheckForUpdates()}>
            Check for Updates
          </Button>
        </div>
      </div>
    </div>
  );
}
