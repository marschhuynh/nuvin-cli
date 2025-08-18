import { Button } from '@/components/ui/button';
import { Clipboard, Edit, Pause, Play, Plus, Save, Settings, Trash2, X } from 'lucide-react';
import type { MCPConfig } from '@/types/mcp';

interface MCPServerHeaderProps {
  isCreating: boolean;
  isEditing: boolean;
  selectedMCP: MCPConfig | null;
  editingMCP: MCPConfig | null;
  mcpForm: Partial<MCPConfig>;
  onImportFromClipboard: () => void;
  onCancelEdit: () => void;
  onSaveInline: () => void;
  onToggle: (id: string) => void;
  onEdit: (mcp: MCPConfig) => void;
  onDelete: (id: string) => void;
}

export function MCPServerHeader({
  isCreating,
  isEditing,
  selectedMCP,
  editingMCP,
  mcpForm,
  onImportFromClipboard,
  onCancelEdit,
  onSaveInline,
  onToggle,
  onEdit,
  onDelete,
}: MCPServerHeaderProps) {
  return (
    <div
      className={`p-4 border-b ${
        isCreating
          ? 'bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-blue-200 dark:border-blue-800'
          : 'bg-card'
      }`}
    >
      <div className='flex items-center justify-between'>
        <div className='flex items-center gap-3'>
          <div
            className={`p-1.5 rounded-lg ${
              isCreating
                ? 'bg-blue-100 dark:bg-blue-900/50 ring-2 ring-blue-200 dark:ring-blue-700'
                : 'bg-blue-50 dark:bg-blue-950/30'
            }`}
          >
            {isCreating ? (
              <Plus className='h-5 w-5 text-blue-600 dark:text-blue-400' />
            ) : (
              <Settings className='h-5 w-5 text-blue-600 dark:text-blue-400' />
            )}
          </div>
          <div>
            <h1
              className={`text-lg font-semibold ${
                isCreating ? 'text-blue-900 dark:text-blue-100' : ''
              }`}
            >
              {isCreating
                ? 'Create New MCP Server'
                : editingMCP
                  ? `Edit ${editingMCP.name}`
                  : selectedMCP?.name || 'MCP Server'}
            </h1>
          </div>
        </div>
        <div className='flex gap-2'>
          {isEditing ? (
            <>
              {isCreating && (
                <Button
                  variant='outline'
                  size='sm'
                  onClick={onImportFromClipboard}
                  className='border-blue-200 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-950/30'
                >
                  <Clipboard className='h-4 w-4 mr-1' />
                  Import
                </Button>
              )}
              <Button variant='outline' size='sm' onClick={onCancelEdit}>
                <X className='h-4 w-4 mr-1' />
                Cancel
              </Button>
              <Button
                size='sm'
                onClick={onSaveInline}
                disabled={
                  !mcpForm.name ||
                  (mcpForm.type === 'stdio' && !mcpForm.command) ||
                  (mcpForm.type === 'http' && !mcpForm.url)
                }
              >
                <Save className='h-4 w-4 mr-1' />
                {editingMCP ? 'Update' : 'Create'}
              </Button>
            </>
          ) : selectedMCP ? (
            <>
              <Button variant='outline' size='sm' onClick={() => onToggle(selectedMCP.id)}>
                {selectedMCP.enabled ? (
                  <>
                    <Pause className='h-4 w-4 mr-1' />
                    Disable
                  </>
                ) : (
                  <>
                    <Play className='h-4 w-4 mr-1' />
                    Enable
                  </>
                )}
              </Button>
              <Button variant='outline' size='sm' onClick={() => onEdit(selectedMCP)}>
                <Edit className='h-4 w-4 mr-1' />
                Edit
              </Button>
              <Button variant='destructive' size='sm' onClick={() => onDelete(selectedMCP.id)}>
                <Trash2 className='h-4 w-4 mr-1' />
                Delete
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

