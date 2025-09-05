import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '@/components/ui/button';
import { useUserPreferenceStore } from '@/store/useUserPreferenceStore';
import { GeneralSettings } from '@/modules/setting';
import { MCPSettings } from '@/modules/mcp';
import { ProviderModal, ProviderSettings } from '@/modules/provider';
import { AgentSettings } from '@/modules/agent/AgentSettings';
import { ToolDebugger } from '@/components/debug/ToolDebugger';

type TabType = 'general' | 'providers' | 'agent' | 'mcp' | 'debug';

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab') as TabType;
  const [activeTab, setActiveTab] = useState<TabType>(tabParam ?? 'general');
  const [showProviderModal, setShowProviderModal] = useState(false);

  useEffect(() => {
    const tabParam = searchParams.get('tab') as TabType;
    const validTabs: TabType[] = ['general', 'providers', 'agent', 'mcp', 'debug'];

    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    } else {
      setActiveTab('general');
      if (!tabParam) {
        const newSearchParams = new URLSearchParams(searchParams);
        newSearchParams.set('tab', 'general');
        setSearchParams(newSearchParams, { replace: true });
      }
    }
  }, [searchParams, setSearchParams]);

  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId);
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('tab', tabId);
    setSearchParams(newSearchParams);
  };

  const { preferences, updatePreferences } = useUserPreferenceStore();

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
      <div className="w-64 flex-shrink-1 border-r bg-card border-border">
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-6">Settings</h1>
          <div className="space-y-2">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                variant={activeTab === tab.id ? 'default' : 'ghost'}
                className="w-full justify-start"
                onClick={() => handleTabChange(tab.id)}
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
          {activeTab === 'general' && <GeneralSettings settings={preferences} onSettingsChange={updatePreferences} />}

          {activeTab === 'providers' && <ProviderSettings onAddProvider={() => setShowProviderModal(true)} />}

          {activeTab === 'agent' && <AgentSettings />}

          {activeTab === 'mcp' && <MCPSettings />}

          {activeTab === 'debug' && <ToolDebugger />}
        </div>
      </div>

      {/* Modals */}
      <ProviderModal open={showProviderModal} onOpenChange={setShowProviderModal} mode="add" />
    </div>
  );
}
