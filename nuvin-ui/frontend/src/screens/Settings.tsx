import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useAgentStore } from '@/store/useAgentStore';
import { useProviderStore } from '@/store/useProviderStore';
import { useUserPreferenceStore } from '@/store/useUserPreferenceStore';
import { GeneralSettings, MCPSettings } from '@/modules/setting';
import { AddProviderModal, ProviderSettings } from '@/modules/provider';
import { AgentSettings } from '@/modules/agent/AgentSettings';
import { ToolDebugger } from '@/components/debug/ToolDebugger';

type TabType = 'general' | 'providers' | 'agent' | 'mcp' | 'debug';

export default function Settings() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);

  // Handle tab query parameter
  useEffect(() => {
    const tabParam = searchParams.get('tab') as TabType;
    if (
      tabParam &&
      ['general', 'providers', 'agent', 'mcp'].includes(tabParam)
    ) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);

  const { reset: resetAgents } = useAgentStore();
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

  const tabs = [
    { id: 'general' as const, label: 'General' },
    { id: 'providers' as const, label: 'Providers' },
    { id: 'agent' as const, label: 'Agent' },
    { id: 'mcp' as const, label: 'MCP' },
    { id: 'debug' as const, label: 'Debug' },
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
        <div className="flex-1 h-[calc(100vh-var(--nav-height)-68px)]">
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

          {activeTab === 'agent' && <AgentSettings />}

          {activeTab === 'mcp' && <MCPSettings />}

          {activeTab === 'debug' && <ToolDebugger />}
        </div>
      </div>

      {/* Modals */}
      <AddProviderModal
        open={showAddProviderModal}
        onOpenChange={setShowAddProviderModal}
      />
    </div>
  );
}
