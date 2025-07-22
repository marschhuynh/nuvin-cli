import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useProviderStore } from '@/store/useProviderStore';
import { ModelStateManager } from '@/modules/agent/components/ModelStateManager';
import { EditProviderModal } from './EditProviderModal';

interface ProviderSettingsProps {
  onAddProvider: () => void;
}

export function ProviderSettings({ onAddProvider }: ProviderSettingsProps) {
  const { providers, deleteProvider, setActiveProvider, activeProviderId } =
    useProviderStore();
  const [editingProvider, setEditingProvider] = useState<any | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);

  const startEditing = (provider: any) => {
    setEditingProvider(provider);
    setShowEditModal(true);
  };

  const handleProviderSelect = (provider: any) => {
    setActiveProvider(provider.id);
  };

  return (
    <div>
      <div className="flex flex-1 justify-between items-center p-6 border-b">
        <h2 className="text-xl font-semibold">Provider Settings</h2>
        <Button onClick={onAddProvider}>
          <Plus className="h-4 w-4 mr-2" />
          Add New Provider
        </Button>
      </div>

      <div className="flex flex-1 flex-col min-h-0 p-6 h-[calc(100vh-var(--header-height))]">
        {/* Main Content - Split Layout */}
        <div className="flex flex-1 gap-4 min-h-0 overflow-hidden">
          {/* Left Side - Provider List */}
          <div className="w-1/3 flex flex-col min-h-0">
            <div className="font-medium text-sm mb-3 flex-shrink-0">
              Providers ({providers.length})
            </div>
            <div className="flex-1 overflow-y-auto">
              {providers.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No providers added yet
                </div>
              ) : (
                <div className="space-y-2">
                  {providers.map((provider) => (
                    <button
                      key={provider.id}
                      type="button"
                      className={`rounded-md border p-3 cursor-pointer transition-colors hover:bg-muted/40 text-left w-full ${
                        activeProviderId === provider.id
                          ? 'bg-accent border-primary'
                          : 'bg-card'
                      }`}
                      onClick={() => handleProviderSelect(provider)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          handleProviderSelect(provider);
                        }
                      }}
                      tabIndex={0}
                      aria-pressed={activeProviderId === provider.id}
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="font-medium truncate">
                            {provider.name}
                          </span>
                          <span className="text-xs text-muted-foreground capitalize">
                            {provider.type || provider.name} •{' '}
                            {provider.apiKey ? 'Key added' : 'No key'}
                          </span>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              startEditing(provider);
                            }}
                            className="h-7 px-2 text-xs"
                          >
                            Edit
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteProvider(provider.id);
                            }}
                            className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Side - Model Management */}
          <div className="w-2/3 flex flex-col min-h-0">
            <div className="font-medium text-sm mb-3 flex-shrink-1">Models</div>
            <div className="flex-1 min-h-0">
              {activeProviderId ? (
                <ModelStateManager />
              ) : (
                <div className="border rounded-lg bg-muted/20 h-full flex items-center justify-center">
                  <div className="text-center text-muted-foreground">
                    Select a provider to view available models
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Edit Provider Modal */}
        <EditProviderModal
          open={showEditModal}
          onOpenChange={setShowEditModal}
          provider={editingProvider}
        />
      </div>
    </div>
  );
}
