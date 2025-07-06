import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useAgentStore } from '@/store/useAgentStore';
import { ModelConfig } from '@/types';

interface AddAgentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type AgentPersona = 'helpful' | 'professional' | 'creative' | 'analytical' | 'casual';
type ResponseLength = 'short' | 'medium' | 'long' | 'detailed';
type AgentType = 'local' | 'remote';

export function AddAgentModal({ open, onOpenChange }: AddAgentModalProps) {
  const { addAgent } = useAgentStore();
  const [newAgentData, setNewAgentData] = useState<{
    name: string;
    persona: AgentPersona;
    responseLength: ResponseLength;
    temperature: number;
    maxTokens: number;
    systemPrompt: string;
    agentType: AgentType;
    modelConfig: ModelConfig;
  }>({
    name: '',
    persona: 'helpful' as AgentPersona,
    responseLength: 'medium' as ResponseLength,
    temperature: 0.7,
    maxTokens: 2048,
    systemPrompt: 'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.',
    agentType: 'local' as AgentType,
    modelConfig: {
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1,
      systemPrompt: 'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.'
    }
  });

  const handleSubmit = () => {
    if (!newAgentData.name.trim()) return;
    addAgent({ ...newAgentData, id: Date.now().toString() });
    resetForm();
    onOpenChange(false);
  };

  const resetForm = () => {
    setNewAgentData({
      name: '',
      persona: 'helpful',
      responseLength: 'medium',
      temperature: 0.7,
      maxTokens: 2048,
      systemPrompt: 'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.',
      agentType: 'local',
      modelConfig: {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 2048,
        topP: 1,
        systemPrompt: 'You are a helpful AI assistant. Provide clear, accurate, and useful responses to help users with their questions and tasks.'
      }
    });
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Add New Agent</DialogTitle>
          <DialogDescription>Create a new AI agent with custom behavior and settings.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 max-h-[500px] overflow-y-auto">
          <div className="grid gap-2">
            <Label htmlFor="newAgentName">Agent Name</Label>
            <Input
              id="newAgentName"
              value={newAgentData.name}
              onChange={(e) => setNewAgentData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter agent name"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newPersona">Persona</Label>
            <Select
              value={newAgentData.persona}
              onValueChange={(value: AgentPersona) =>
                setNewAgentData(prev => ({ ...prev, persona: value }))
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
          <Label htmlFor="newAgentType">Agent Type</Label>
          <Select
            value={newAgentData.agentType}
            onValueChange={(value: AgentType) =>
              setNewAgentData(prev => ({ ...prev, agentType: value }))
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
          <Label htmlFor="newResponseLength">Response Length</Label>
          <Select
            value={newAgentData.responseLength}
            onValueChange={(value: ResponseLength) =>
              setNewAgentData(prev => ({ ...prev, responseLength: value }))
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
            <Label htmlFor="newTemperature">Temperature: {newAgentData.temperature}</Label>
            <input
              type="range"
              id="newTemperature"
              min="0"
              max="2"
              step="0.1"
              value={newAgentData.temperature}
              onChange={(e) => setNewAgentData(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Focused (0)</span>
              <span>Balanced (1)</span>
              <span>Creative (2)</span>
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newMaxTokens">Max Tokens</Label>
            <Input
              id="newMaxTokens"
              type="number"
              min="100"
              max="8192"
              value={newAgentData.maxTokens}
              onChange={(e) => setNewAgentData(prev => ({ ...prev, maxTokens: parseInt(e.target.value) || 2048 }))}
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of tokens in the response (100-8192)
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newSystemPrompt">System Prompt</Label>
            <Textarea
              id="newSystemPrompt"
              value={newAgentData.systemPrompt}
              onChange={(e) => setNewAgentData(prev => ({ ...prev, systemPrompt: e.target.value }))}
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
          <Button onClick={handleSubmit} disabled={!newAgentData.name.trim()}>Add Agent</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
