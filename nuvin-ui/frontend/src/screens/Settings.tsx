import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAgentStore } from '@/store/useAgentStore';
import { useProviderStore } from '@/store/useProviderStore';
import { useUserPreferenceStore } from '@/store/useUserPreferenceStore';
import { GeneralSettings, MCPSettings } from '@/modules/setting';
import { AddProviderModal, ProviderSettings } from '@/modules/provider';
import { AgentModal, AgentSettings } from '@/modules/agent/components';

type TabType = 'general' | 'providers' | 'agent' | 'mcp';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [showAgentModal, setShowAgentModal] = useState(false);
  const [editingAgent, setEditingAgent] = useState<any | null>(null);

  const { agents, reset: resetAgents } = useAgentStore();
  const { reset: resetProviders } = useProviderStore();
  const {
    preferences,
    updatePreferences,
    reset: resetPreferences,
  } = useUserPreferenceStore();

  const handleReset = () => {
    switch (activeTab) {
      case 'general':
        resetPreferences();
        break;
      case 'providers':
        resetProviders();
        break;
      case 'agent':
        resetAgents();
        break;
      case 'mcp':
        resetPreferences();
        break;
    }
  };

  const handleAddAgent = () => {
    setEditingAgent(null);
    setShowAgentModal(true);
  };

  const handleEditAgent = (agentId: string) => {
    const agent = agents.find((a) => a.id === agentId);
    setEditingAgent(agent || null);
    setShowAgentModal(true);
  };

  const handleCloseAgentModal = () => {
    setShowAgentModal(false);
    setEditingAgent(null);
  };

  const tabs = [
    { id: 'general' as const, label: 'General' },
    { id: 'providers' as const, label: 'Providers' },
    { id: 'agent' as const, label: 'Agent' },
    { id: 'mcp' as const, label: 'MCP' },
  ];

  return (
    <div className="flex flex-1 overflow-hidden bg-background">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 border-r bg-card border-border">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6">Settings</h1>
          <div className="space-y-2">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? 'default' : 'ghost'}
                className="w-full justify-start"
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 flex flex-col bg-background">
        <div className="flex-1">
          {activeTab === 'general' && (
            <GeneralSettings
              settings={preferences}
              onSettingsChange={updatePreferences}
            />
          )}

          {activeTab === 'providers' && (
            <ProviderSettings
              onAddProvider={() => setShowAddProviderModal(true)}
            />
          )}

          {activeTab === 'agent' && (
            <AgentSettings
              onAddAgent={handleAddAgent}
              onEditAgent={handleEditAgent}
            />
          )}

          {activeTab === 'mcp' && (
            <MCPSettings
              settings={preferences}
              onSettingsChange={updatePreferences}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4">
          <Button variant="outline" onClick={handleReset}>
            Reset to Defaults
          </Button>
        </div>
      </div>

      {/* Modals */}
      <AddProviderModal
        open={showAddProviderModal}
        onOpenChange={setShowAddProviderModal}
      />
      <AgentModal
        open={showAgentModal}
        onOpenChange={handleCloseAgentModal}
        agent={editingAgent}
      />
    </div>
  );
}
