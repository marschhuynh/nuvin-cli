import { MessageCircle, User } from 'lucide-react';
import { SettingsDialog } from './SettingsDialog';

interface NavbarProps {
  userName?: string;
}

export function Navbar({ userName = "Marsch Huynh" }: NavbarProps) {
  return (
    <nav className="border-b border-border bg-card px-6 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageCircle className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">Nuvin Space</h1>
        </div>
        <div className="flex items-center gap-4">
          <SettingsDialog />
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium">{userName}</span>
          </div>
        </div>
      </div>
    </nav>
  );
}