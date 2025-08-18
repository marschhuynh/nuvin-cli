import { Label } from '@/components/ui/label';
import { MCPServerToolsList } from '@/components/mcp/MCPServerToolsList';
import type { MCPConfig } from '@/types/mcp';

interface MCPServerDetailsProps {
  server: MCPConfig;
  enabledTools: string[];
  onUpdateEnabledTools: (newEnabled: string[]) => void;
  refreshTrigger: number;
}

export function MCPServerDetails({
  server,
  enabledTools,
  onUpdateEnabledTools,
  refreshTrigger,
}: MCPServerDetailsProps) {
  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div className='space-y-4'>
          <div className='grid gap-2'>
            <Label className='text-sm font-medium'>Server Name</Label>
            <div className='px-3 py-2 border rounded-md bg-background text-sm select-all'>
              {server.name}
            </div>
          </div>
          <div className='grid gap-2'>
            <Label className='text-sm font-medium'>Server Type</Label>
            <div className='px-3 py-2 border rounded-md bg-background text-sm select-all'>
              {server.type === 'stdio' ? 'Stdio (Command-based)' : 'HTTP (URL-based)'}
            </div>
          </div>
        </div>

        <div className='space-y-4'>
          {server.type === 'stdio' ? (
            <div className='grid gap-2'>
              <Label className='text-sm font-medium'>Command</Label>
              <div className='px-3 py-2 border rounded-md bg-background text-sm font-mono select-all'>
                {server.command}
              </div>
            </div>
          ) : (
            <div className='grid gap-2'>
              <Label className='text-sm font-medium'>URL</Label>
              <div className='px-3 py-2 border rounded-md bg-background text-sm font-mono select-all'>
                {server.url}
              </div>
            </div>
          )}

          {server.type === 'stdio' && (
            <div className='grid gap-2'>
              <Label className='text-sm font-medium'>Arguments</Label>
              {server.args && server.args.length > 0 ? (
                <div className='px-3 py-2 border rounded-md bg-background text-sm font-mono select-all min-h-[36px] flex items-center'>
                  {server.args.join(' ')}
                </div>
              ) : (
                <div className='px-3 py-2 border rounded-md bg-background text-sm text-muted-foreground h-9 flex items-center'>
                  No arguments
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className='grid gap-2'>
        <Label className='text-sm font-medium'>Description</Label>
        <div className='px-3 py-2 border rounded-md bg-background text-sm leading-relaxed min-h-[60px] select-all'>
          {server.description || 'No description provided'}
        </div>
      </div>

      <div className='grid gap-2'>
        <Label className='text-sm font-medium'>
          {server.type === 'http' ? 'HTTP Headers' : 'Environment Variables'}
        </Label>
        {server.env && Object.keys(server.env).length > 0 ? (
          <div className='border rounded-md bg-background'>
            <div className='p-3'>
              <div className='space-y-2'>
                {Object.entries(server.env).map(([key, value]) => (
                  <div key={key} className='flex items-center gap-2 text-sm'>
                    <span className='font-mono text-blue-600 dark:text-blue-400 select-all'>{key}</span>
                    <span className='text-muted-foreground'>=</span>
                    <span className='font-mono text-green-600 dark:text-green-400 select-all'>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className='px-3 py-2 border rounded-md bg-background text-sm text-muted-foreground min-h-[60px] flex items-center'>
            {server.type === 'http' ? 'No HTTP headers' : 'No environment variables'}
          </div>
        )}
      </div>

      <div className='grid gap-2'>
        <Label className='text-sm font-medium'>
          {server.type === 'stdio' ? 'Full Command' : 'Connection URL'}
        </Label>
        <div className='px-3 py-2 border rounded-md bg-muted/50 text-sm font-mono select-all leading-relaxed'>
          {server.type === 'stdio'
            ? `${server.command || ''}${server.args && server.args.length > 0 ? ` ${server.args.join(' ')}` : ''}`
            : server.url}
        </div>
      </div>

      <div className='space-y-4'>
        <div className='rounded-lg'>
          <MCPServerToolsList
            server={server}
            enabledTools={enabledTools}
            onToolToggle={(toolName, enabled) => {
              const newEnabled = enabled
                ? [...enabledTools, toolName]
                : enabledTools.filter((name) => name !== toolName);
              onUpdateEnabledTools(newEnabled);
            }}
            isEditing
            refreshTrigger={refreshTrigger}
          />
        </div>
      </div>
    </div>
  );
}

