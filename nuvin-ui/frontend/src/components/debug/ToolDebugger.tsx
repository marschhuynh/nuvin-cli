import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toolRegistry } from '@/lib/tools/tool-registry';
import { mcpManager } from '@/lib/mcp/mcp-manager';
import { toolIntegrationService } from '@/lib/tools/tool-integration-service';
import { useAgentStore } from '@/store/useAgentStore';
import { RefreshCw, Bug } from 'lucide-react';
import { isWailsEnvironment } from '@/lib/browser-runtime';

interface DebugInfo {
  timestamp: string;
  selectedAgent: string;
  runtime: {
    wailsGoAvailable: boolean;
    wailsRuntimeAvailable: boolean;
    mcpDebug: boolean;
  };
  toolRegistry: {
    totalTools: number;
    builtInTools: string[];
    mcpTools: Array<{
      name: string;
      serverId?: string;
      available: boolean;
      schema: unknown;
    }>;
    mcpServers: string[];
  };
  mcp: {
    stats: unknown;
    servers: Array<{
      id: string;
      name: string;
      type: string;
      status: string;
      lastError: string | null;
      toolCount: number;
      resourceCount: number;
    }>;
  };
  agentTools: {
    configuredTools: string[];
    availableToAgent: string[];
  };
}

export function ToolDebugger() {
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const { activeAgentId, agents } = useAgentStore();

  const refreshDebugInfo = useCallback(() => {
    const selectedAgent = agents.find((a) => a.id === activeAgentId);

    const info = {
      timestamp: new Date().toISOString(),
      selectedAgent: selectedAgent?.name || 'None',
      runtime: {
        wailsGoAvailable: isWailsEnvironment(),
        wailsRuntimeAvailable: isWailsEnvironment(),
        mcpDebug: (() => {
          try {
            if ((window as unknown as { __MCP_DEBUG__?: boolean }).__MCP_DEBUG__) return true;
            return localStorage.getItem('MCP_DEBUG') === '1';
          } catch {
            return false;
          }
        })(),
      },
      toolRegistry: {
        totalTools: toolRegistry.getToolCount(),
        builtInTools: toolRegistry.getBuiltInTools().map((t) => t.definition.name),
        mcpTools: toolRegistry.getAllMCPTools().map((t) => ({
          name: t.definition.name,
          serverId: t.getServerId(),
          available: t.isAvailable(),
          schema: t.definition,
        })),
        mcpServers: toolRegistry.getMCPServerIds(),
      },
      mcp: {
        stats: mcpManager.getStats(),
        servers: mcpManager.getAllServerConfigs().map((c) => ({
          id: c.id,
          name: c.name,
          type: c.type,
          status: c.status,
          lastError: c.lastError || null,
          toolCount: c.toolCount,
          resourceCount: c.resourceCount,
        })),
      },
      agentTools: {
        configuredTools: selectedAgent?.toolConfig?.enabledTools || [],
        availableToAgent: toolIntegrationService
          .getAvailableToolsForAgent(selectedAgent?.toolConfig)
          .map((t) => t.function.name),
      },
    };

    setDebugInfo(info);
  }, [activeAgentId, agents.find]);

  useEffect(() => {
    refreshDebugInfo();
  }, [refreshDebugInfo]);

  if (!debugInfo) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Button onClick={refreshDebugInfo} variant="outline">
            <Bug className="w-4 h-4 mr-2" />
            Load Tool Debug Info
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full h-full flex flex-col border-0">
      <CardHeader className="flex-shrink-0">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center">
            <Bug className="w-5 h-5 mr-2" />
            Tool Debug Information
          </span>
          <div className="flex items-center gap-2">
            <Button onClick={refreshDebugInfo} size="sm" variant="outline">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
            <Button
              size="sm"
              variant={debugInfo?.runtime?.mcpDebug ? 'default' : 'outline'}
              onClick={() => {
                try {
                  const enabled = localStorage.getItem('MCP_DEBUG') === '1';
                  localStorage.setItem('MCP_DEBUG', enabled ? '0' : '1');
                } catch {}
                refreshDebugInfo();
              }}
            >
              {debugInfo?.runtime?.mcpDebug ? 'Disable MCP Debug' : 'Enable MCP Debug'}
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 flex-1 overflow-y-auto">
        {/* Selected Agent */}
        <div>
          <h4 className="font-medium text-sm mb-2">Selected Agent</h4>
          <Badge variant="outline">{debugInfo.selectedAgent}</Badge>
        </div>

        {/* Runtime Info */}
        <div>
          <h4 className="font-medium text-sm mb-2">Runtime</h4>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              Wails Go: <Badge>{debugInfo.runtime.wailsGoAvailable ? 'yes' : 'no'}</Badge>
            </div>
            <div>
              Wails Runtime: <Badge>{debugInfo.runtime.wailsRuntimeAvailable ? 'yes' : 'no'}</Badge>
            </div>
            <div>
              MCP Debug: <Badge>{debugInfo.runtime.mcpDebug ? 'on' : 'off'}</Badge>
            </div>
          </div>
        </div>

        {/* Tool Registry Info */}
        <div>
          <h4 className="font-medium text-sm mb-2">Tool Registry</h4>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              Total Tools: <Badge>{debugInfo.toolRegistry.totalTools}</Badge>
            </div>
            <div>
              MCP Servers: <Badge>{debugInfo.toolRegistry.mcpServers.length}</Badge>
            </div>
          </div>
        </div>

        {/* Built-in Tools */}
        <div>
          <h4 className="font-medium text-sm mb-2">Built-in Tools ({debugInfo.toolRegistry.builtInTools.length})</h4>
          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto pr-2">
            {debugInfo.toolRegistry.builtInTools.map((tool: string) => (
              <Badge key={tool} variant="secondary" className="text-xs">
                {tool}
              </Badge>
            ))}
          </div>
        </div>

        {/* MCP Tools */}
        <div>
          <h4 className="font-medium text-sm mb-2">MCP Tools ({debugInfo.toolRegistry.mcpTools.length})</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
            {debugInfo.toolRegistry.mcpTools.map((tool) => (
              <div key={tool.name} className="border rounded p-2 bg-gray-50 dark:bg-gray-800">
                <div className="flex items-center space-x-2 mb-1">
                  <Badge variant={tool.available ? 'default' : 'secondary'} className="text-xs">
                    {tool.name}
                  </Badge>
                  <span className="text-xs text-gray-500">({tool.serverId})</span>
                  {tool.available && (
                    <Badge variant="outline" className="text-xs">
                      Available
                    </Badge>
                  )}
                </div>
                <details className="text-xs">
                  <summary className="cursor-pointer text-blue-600 dark:text-blue-400 hover:underline">
                    Show Schema
                  </summary>
                  <pre className="mt-1 p-2 bg-white dark:bg-gray-900 rounded text-xs overflow-auto max-h-40 border">
                    {JSON.stringify(tool.schema, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        </div>

        {/* MCP Servers */}
        <div>
          <h4 className="font-medium text-sm mb-2">MCP Servers ({debugInfo.mcp.servers.length})</h4>
          <div className="space-y-1 max-h-40 overflow-y-auto pr-2">
            {debugInfo.mcp.servers.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-xs">
                <Badge variant="outline">{s.name}</Badge>
                <span className="text-gray-500">{s.type}</span>
                <Badge
                  variant={s.status === 'connected' ? 'default' : s.status === 'error' ? 'destructive' : 'secondary'}
                >
                  {s.status}
                </Badge>
                {s.lastError && <span className="text-red-500 truncate">{s.lastError}</span>}
                <span className="text-gray-500">
                  tools:{s.toolCount} res:{s.resourceCount}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Agent Tool Configuration */}
        <div>
          <h4 className="font-medium text-sm mb-2">Agent Tool Configuration</h4>
          <div className="space-y-2">
            <div>
              <span className="text-xs font-medium">Manually Configured Tools:</span>
              <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto pr-2">
                {debugInfo.agentTools.configuredTools.length > 0 ? (
                  debugInfo.agentTools.configuredTools.map((tool: string) => (
                    <Badge key={tool} variant="outline" className="text-xs">
                      {tool}
                    </Badge>
                  ))
                ) : (
                  <span className="text-xs text-gray-500">None configured</span>
                )}
              </div>
            </div>

            <div>
              <span className="text-xs font-medium">Actually Available to Agent:</span>
              <div className="flex flex-wrap gap-1 mt-1 max-h-24 overflow-y-auto pr-2">
                {debugInfo.agentTools.availableToAgent.map((tool: string) => (
                  <Badge key={tool} variant="default" className="text-xs">
                    {tool}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Raw Debug Data */}
        <div className="text-xs">
          <h4 className="font-medium text-sm mb-2">Raw Debug Data</h4>
          <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded text-xs overflow-auto flex-1 border border-gray-200 dark:border-gray-700 min-h-[300px]">
            {JSON.stringify(debugInfo, null, 2)}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}
