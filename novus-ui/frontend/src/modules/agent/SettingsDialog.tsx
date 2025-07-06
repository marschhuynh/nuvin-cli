import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { GeneralSettings } from './components/GeneralSettings';
import { ProviderSettings } from './components/ProviderSettings';
import { AgentSettings } from './components/AgentSettings';
import { AddProviderModal } from './components/AddProviderModal';
import { AddAgentModal } from './components/AddAgentModal';
import { EditAgentModal } from './components/EditAgentModal';
import { useAgentStore } from '@/store/useAgentStore';
import { useProviderStore } from '@/store/useProviderStore';
import { useUserPreferenceStore } from '@/store/useUserPreferenceStore';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type TabType = 'general' | 'providers' | 'agent';

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [activeTab, setActiveTab] = useState<TabType>('general');
  const [showAddProviderModal, setShowAddProviderModal] = useState(false);
  const [showAddAgentModal, setShowAddAgentModal] = useState(false);
  const [showEditAgentModal, setShowEditAgentModal] = useState(false);
  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);

  const { reset: resetAgents } = useAgentStore();
  const { reset: resetProviders } = useProviderStore();
  const { preferences, updatePreferences, reset: resetPreferences } = useUserPreferenceStore();

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
    }
  };

  const handleEditAgent = (agentId: string) => {
    setEditingAgentId(agentId);
    setShowEditAgentModal(true);
  };

  const tabs = [
    { id: 'general' as const, label: 'General' },
    { id: 'providers' as const, label: 'Providers' },
    { id: 'agent' as const, label: 'Agent' },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="fixed max-w-2/3 h-2/3 flex flex-col">
          <DialogHeader className="flex-shrink-0 mb-4">
            <DialogTitle>Settings</DialogTitle>
          </DialogHeader>

          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar */}
            <div className="w-48 flex-shrink-0 space-y-2 pr-4">
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

            {/* Content Area */}
            <div className="flex-1 flex flex-col">
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
                  onAddAgent={() => setShowAddAgentModal(true)}
                  onEditAgent={handleEditAgent}
                />
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between mt-4 pt-4 border-t flex-shrink-0">
            <Button variant="outline" onClick={handleReset}>
              Reset to Defaults
            </Button>
            <div className="flex gap-2">
              <Button onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Modals */}
      <AddProviderModal
        open={showAddProviderModal}
        onOpenChange={setShowAddProviderModal}
      />
      <AddAgentModal
        open={showAddAgentModal}
        onOpenChange={setShowAddAgentModal}
      />
      <EditAgentModal
        open={showEditAgentModal}
        onOpenChange={setShowEditAgentModal}
        agentId={editingAgentId}
      />
    </>
  );
}
