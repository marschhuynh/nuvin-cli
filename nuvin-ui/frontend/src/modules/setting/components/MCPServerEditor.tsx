import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus } from 'lucide-react';
import type { MCPConfig } from '@/types/mcp';

interface MCPServerEditorProps {
  mcpForm: Partial<MCPConfig>;
  setMcpForm: (updater: (prev: Partial<MCPConfig>) => Partial<MCPConfig>) => void;
  handleArgChange: (index: number, value: string) => void;
  addArg: () => void;
  removeArg: (index: number) => void;
  handleEnvVarChange: (key: string, value: string) => void;
  addEnvVar: () => void;
  removeEnvVar: (key: string) => void;
}

export function MCPServerEditor({
  mcpForm,
  setMcpForm,
  handleArgChange,
  addArg,
  removeArg,
  handleEnvVarChange,
  addEnvVar,
  removeEnvVar,
}: MCPServerEditorProps) {
  return (
    <div className='space-y-6'>
      <div className='grid grid-cols-1 md:grid-cols-2 gap-6'>
        <div className='space-y-4'>
          <div className='grid gap-2'>
            <Label className='text-sm font-medium'>Server Name</Label>
            <Input
              value={mcpForm.name || ''}
              onChange={(e) =>
                setMcpForm((prev) => ({
                  ...prev,
                  name: e.target.value,
                }))
              }
              placeholder='My MCP Server'
            />
          </div>
          <div className='grid gap-2'>
            <Label className='text-sm font-medium'>Server Type</Label>
            <Select
              value={mcpForm.type || 'stdio'}
              onValueChange={(value: 'stdio' | 'http') =>
                setMcpForm((prev) => ({
                  ...prev,
                  type: value,
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder='Select server type' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='stdio'>Stdio (Command-based)</SelectItem>
                <SelectItem value='http'>HTTP (URL-based)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className='space-y-4'>
          {(mcpForm.type || 'stdio') === 'stdio' ? (
            <div className='grid gap-2'>
              <Label className='text-sm font-medium'>Command</Label>
              <Input
                value={mcpForm.command || ''}
                onChange={(e) =>
                  setMcpForm((prev) => ({
                    ...prev,
                    command: e.target.value,
                  }))
                }
                placeholder='python /path/to/server.py'
              />
            </div>
          ) : (
            <div className='grid gap-2'>
              <Label className='text-sm font-medium'>URL</Label>
              <Input
                value={mcpForm.url || ''}
                onChange={(e) =>
                  setMcpForm((prev) => ({
                    ...prev,
                    url: e.target.value,
                  }))
                }
                placeholder='http://localhost:3000'
              />
            </div>
          )}

          {(mcpForm.type || 'stdio') === 'stdio' && (
            <div className='grid gap-2'>
              <Label className='text-sm font-medium'>Arguments</Label>
              <div className='space-y-2'>
                {(mcpForm.args || []).map((arg, index) => (
                  <div key={`arg-${index}-${arg}`} className='flex gap-2'>
                    <Input
                      value={arg}
                      onChange={(e) => handleArgChange(index, e.target.value)}
                      placeholder='Argument'
                    />
                    <Button variant='ghost' size='icon' onClick={() => removeArg(index)}>
                      <Trash2 className='w-4 h-4' />
                    </Button>
                  </div>
                ))}
                <Button variant='outline' onClick={addArg}>
                  <Plus className='w-4 h-4 mr-2' />
                  Add Argument
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className='grid gap-2'>
        <Label className='text-sm font-medium'>Description</Label>
        <Textarea
          value={mcpForm.description || ''}
          onChange={(e) =>
            setMcpForm((prev) => ({
              ...prev,
              description: e.target.value,
            }))
          }
          placeholder='Brief description of what this MCP server does'
          rows={3}
        />
      </div>

      <div className='grid gap-2'>
        <Label className='text-sm font-medium'>
          {(mcpForm.type || 'stdio') === 'http' ? 'HTTP Headers' : 'Environment Variables'}
        </Label>
        <div className='space-y-2'>
          {Object.entries(mcpForm.env || {}).map(([key, value]) => (
            <div key={key} className='flex gap-2'>
              <Input
                value={key}
                onChange={(e) => {
                  const newKey = e.target.value;
                  const newEnv = { ...(mcpForm.env || {}) } as Record<string, string>;
                  delete newEnv[key];
                  newEnv[newKey] = value as string;
                  setMcpForm((prev) => ({
                    ...prev,
                    env: newEnv,
                  }));
                }}
                placeholder={(mcpForm.type || 'stdio') === 'http' ? 'Header-Name' : 'KEY'}
                className='w-1/3'
              />
              <Input
                value={value as string}
                onChange={(e) => handleEnvVarChange(key, e.target.value)}
                placeholder={(mcpForm.type || 'stdio') === 'http' ? 'header value' : 'value'}
                className='w-2/3'
              />
              <Button variant='ghost' size='icon' onClick={() => removeEnvVar(key)} className='h-9 w-9'>
                <Trash2 className='w-4 h-4' />
              </Button>
            </div>
          ))}
          <Button variant='outline' onClick={addEnvVar} className='h-9'>
            <Plus className='w-4 h-4 mr-2' />
            {(mcpForm.type || 'stdio') === 'http' ? 'Add HTTP Header' : 'Add Environment Variable'}
          </Button>
        </div>
      </div>
    </div>
  );
}

