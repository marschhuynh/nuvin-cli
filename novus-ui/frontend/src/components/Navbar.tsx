import { useState } from 'react';
import { MessageCircle, User, Settings } from 'lucide-react';
import { Button } from './ui/button';
import { SettingsDialog } from '@/modules/setting/SettingsDialog';

interface NavbarProps {
  userName?: string;
}

export function Navbar({ userName = "Guest" }: NavbarProps) {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <nav className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageCircle className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">Nuvin Space</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => setShowSettings(true)}
            >
              <Settings className="h-4 w-4" />
              <span className="sr-only">Settings</span>
            </Button>
            {/* <div className="flex items-center gap-2">
              <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center">
                <User className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-sm font-medium">{userName}</span>
            </div> */}
          </div>
        </div>
      </nav>

      <SettingsDialog
        open={showSettings}
        onOpenChange={setShowSettings}
      />
    </>
  );
}