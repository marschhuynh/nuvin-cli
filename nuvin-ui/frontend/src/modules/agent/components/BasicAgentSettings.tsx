import { Globe, Home } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AgentType = 'local' | 'remote';

interface BasicAgentSettingsProps {
  name: string;
  agentType: AgentType;
  isEditing: boolean;
  onNameChange: (name: string) => void;
  onAgentTypeChange: (type: AgentType) => void;
}

export function BasicAgentSettings({
  name,
  agentType,
  isEditing,
  onNameChange,
  onAgentTypeChange,
}: BasicAgentSettingsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="agentName">Agent Name</Label>
          {isEditing ? (
            <Input
              id="agentName"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              placeholder="Enter agent name"
            />
          ) : (
            <div className="px-3 py-2 border rounded-md bg-background text-sm select-all h-9 flex items-center">
              {name || 'Unnamed Agent'}
            </div>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <div className="grid gap-2">
          <Label>Agent Type</Label>
          {isEditing ? (
            <div className="flex items-center space-x-0 bg-muted rounded-md p-0.5 h-9">
              <button
                type="button"
                onClick={() => onAgentTypeChange('local')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all flex-1 ${
                  agentType === 'local'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Local
              </button>
              <button
                type="button"
                onClick={() => onAgentTypeChange('remote')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-all flex-1 ${
                  agentType === 'remote'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Remote
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-2 border rounded-md bg-background text-sm h-9">
              {agentType === 'remote' ? (
                <Globe className="h-4 w-4 text-blue-500" />
              ) : (
                <Home className="h-4 w-4 text-green-500" />
              )}
              <span className="capitalize">{agentType}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
