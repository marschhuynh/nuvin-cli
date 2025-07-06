import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAgentStore } from '@/store/useAgentStore';
import { ModelConfig } from '@/types';

interface EditAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string | null;
}

type AgentPersona = 'helpful' | 'professional' | 'creative' | 'analytical' | 'casual';
type ResponseLength = 'short' | 'medium' | 'long' | 'detailed';
type AgentType = 'local' | 'remote';

export function EditAgentModal({ open, onOpenChange, agentId }: EditAgentModalProps) {
  const { agents, updateAgent } = useAgentStore();
  const [editData, setEditData] = useState<{
    id: string;
    name: string;
    persona: AgentPersona;
    responseLength: ResponseLength;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
    agentType: AgentType;
    modelConfig: ModelConfig;
  }>({
    id: '',
    name: '',
    persona: 'helpful' as AgentPersona,
    responseLength: 'medium' as ResponseLength,
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: '',
    agentType: 'local' as AgentType,
    modelConfig: {
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
      systemPrompt: ''
    }
  });

  useEffect(() => {
    if (open && agentId) {
      const agent = agents.find(a => a.id === agentId);
      if (agent) {
        setEditData({
          id: agent.id,
          name: agent.name,
          persona: agent.persona,
          responseLength: agent.responseLength,
          temperature: agent.temperature,
          maxTokens: agent.maxTokens,
          systemPrompt: agent.systemPrompt,
          agentType: agent.agentType,
          modelConfig: agent.modelConfig
        });
      }
    }
  }, [open, agentId, agents]);

  const handleSubmit = () => {
    if (!editData.name.trim() || !editData.id) return;
    updateAgent(editData);
    onOpenChange(false);
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Agent</DialogTitle>
          <DialogDescription>Modify the AI agent's behavior and settings.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[500px] overflow-y-auto">
          <div className="grid gap-2">
            <Label htmlFor="editAgentName">Agent Name</Label>
            <Input
              id="editAgentName"
              value={editData.name}
              onChange={(e) => setEditData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter agent name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editPersona">Persona</Label>
            <Select
              value={editData.persona}
              onValueChange={(value: AgentPersona) =>
                setEditData(prev => ({ ...prev, persona: value }))
              }
            >
              <SelectTrigger>
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
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editAgentType">Agent Type</Label>
            <Select
              value={editData.agentType}
              onValueChange={(value: AgentType) =>
                setEditData(prev => ({ ...prev, agentType: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select agent type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">Local</SelectItem>
                <SelectItem value="remote">Remote</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editResponseLength">Response Length</Label>
            <Select
              value={editData.responseLength}
              onValueChange={(value: ResponseLength) =>
                setEditData(prev => ({ ...prev, responseLength: value }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select response length" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="short">Short</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="long">Long</SelectItem>
                <SelectItem value="detailed">Detailed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editTemperature">Temperature: {editData.temperature}</Label>
            <input
              type="range"
              id="editTemperature"
              min="0"
              max="2"
              step="0.1"
              value={editData.temperature}
              onChange={(e) => setEditData(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Focused (0)</span>
              <span>Balanced (1)</span>
              <span>Creative (2)</span>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editMaxTokens">Max Tokens</Label>
            <Input
              id="editMaxTokens"
              type="number"
              min="100"
              max="8192"
              value={editData.maxTokens}
              onChange={(e) => setEditData(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 2048 }))}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of tokens in the response (100-8192)
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="editSystemPrompt">System Prompt</Label>
            <Textarea
              id="editSystemPrompt"
              value={editData.systemPrompt}
              onChange={(e) => setEditData(prev => ({ ...prev, systemPrompt: e.target.value }))}
              placeholder="Enter system prompt..."
              className="min-h-[100px] resize-none"
            />
            <p className="text-xs text-muted-foreground">
              Define the agent's behavior and role
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!editData.name.trim()}>Save Changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
