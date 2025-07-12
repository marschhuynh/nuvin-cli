import { SettingsDialog } from '@/modules/setting/SettingsDialog';
import { Home, Settings, Sun, Moon } from 'lucide-react';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useTheme } from '@/lib/theme';

import appIcon from '../assets/appstore.png';
import { Button } from './ui/button';

interface NavbarProps {
  userName?: string;
}

export function Navbar({ userName = 'Guest' }: NavbarProps) {
  const [showSettings, setShowSettings] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { theme, setTheme, resolvedTheme } = useTheme();

  return (
    <>
      <nav className="border-b border-border bg-card px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-3 cursor-pointer"
              onClick={() => navigate('/')}
            >
              <img
                src={appIcon}
                alt="Nuvin Space"
                className="h-9 w-9 transition-transform duration-200 active:animate-[wiggle_0.3s_ease-in-out]"
              />
              <h1 className="text-xl font-semibold tracking-tight">
                Nuvin Space
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button
                variant={location.pathname === '/' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 px-3 gap-2"
                onClick={() => navigate('/')}
              >
                <Home className="h-4 w-4" />
                <span>Dashboard</span>
              </Button>
              <Button
                variant={
                  location.pathname === '/settings' ? 'default' : 'ghost'
                }
                size="sm"
                className="h-8 px-3 gap-2"
                onClick={() => navigate('/settings')}
              >
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Button>
            </div>
            
            {/* Theme Toggle Button */}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/40"
              onClick={() => {
                if (resolvedTheme === 'dark') {
                  setTheme('light');
                } else {
                  setTheme('dark');
                }
              }}
              title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
            >
              {resolvedTheme === 'dark' ? (
                <Sun className="h-4 w-4 opacity-60" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
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

      <SettingsDialog open={showSettings} onOpenChange={setShowSettings} />
    </>
  );
}
