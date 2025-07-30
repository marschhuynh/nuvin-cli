import { Globe, Home } from 'lucide-react';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';

interface LocalAgentSettingsProps {
  name: string;
  agentType: 'local' | 'remote';
  onNameChange: (name: string) => void;
  onAgentTypeChange: (type: 'local' | 'remote') => void;
  persona: 'helpful' | 'professional' | 'creative' | 'analytical' | 'casual';
  responseLength: 'short' | 'medium' | 'long';
  temperature: number;
  topP: number;
  maxTokens: number;
  isEditing: boolean;
  onPersonaChange: (
    persona: 'helpful' | 'professional' | 'creative' | 'analytical' | 'casual',
  ) => void;
  onResponseLengthChange: (length: 'short' | 'medium' | 'long') => void;
  onTemperatureChange: (temp: number) => void;
  onTopPChange: (topP: number) => void;
  onMaxTokensChange: (tokens: number) => void;
}

export function LocalAgentSettings({
  persona,
  responseLength,
  temperature,
  maxTokens,
  isEditing,
  name,
  agentType,
  onNameChange,
  onAgentTypeChange,
  onPersonaChange,
  onResponseLengthChange,
  onTemperatureChange,
  onMaxTokensChange,
}: LocalAgentSettingsProps) {
  return (
    <div className="@container">
      <div className="grid grid-cols-1 @min-[260px]:grid-cols-2 gap-6">
        {/* Left Column */}
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

          <div className="grid gap-2">
            <Label htmlFor="persona">Persona</Label>
            {isEditing ? (
              <Select value={persona} onValueChange={onPersonaChange}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select persona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="helpful">Helpful Assistant</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="creative">Creative</SelectItem>
                  <SelectItem value="analytical">Analytical</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="px-3 py-2 border rounded-md bg-background text-sm capitalize select-all h-9 flex items-center">
                {persona === 'helpful' ? 'Helpful Assistant' : persona}
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="responseLength">Response Length</Label>
            {isEditing ? (
              <Select
                value={responseLength}
                onValueChange={onResponseLengthChange}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select response length" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="short">Short</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="long">Long</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="px-3 py-2 border rounded-md bg-background text-sm capitalize select-all h-9 flex items-center">
                {responseLength}
              </div>
            )}
          </div>
        </div>

        {/* Right Column */}
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
          <div className="grid gap-2">
            <Label htmlFor="temperature">Temperature: {temperature}</Label>
            <Slider
              value={[temperature]}
              onValueChange={(value) => onTemperatureChange(value[0])}
              max={2}
              min={0}
              step={0.1}
              className="w-full"
              disabled={!isEditing}
            />
            <div className="flex justify-between text-xs text-muted-foreground h-5.5">
              <span>Focused (0)</span>
              <span>Creative (2)</span>
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="maxTokens">Max Tokens</Label>
            {isEditing ? (
              <Input
                id="maxTokens"
                type="number"
                min="100"
                max="8192"
                value={maxTokens}
                onChange={(e) =>
                  onMaxTokensChange(parseInt(e.target.value) || 2048)
                }
              />
            ) : (
              <div className="px-3 py-2 border rounded-md bg-background text-sm select-all h-9 flex items-center">
                {maxTokens.toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
