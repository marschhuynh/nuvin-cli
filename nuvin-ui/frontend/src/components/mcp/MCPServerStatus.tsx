import type { ExtendedMCPConfig } from '@/types/mcp';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Play, Square, RotateCcw, AlertCircle, CheckCircle, Clock, Loader2 } from 'lucide-react';

interface MCPServerStatusProps {
  server: ExtendedMCPConfig;
  onStart: (serverId: string) => Promise<void>;
  onStop: (serverId: string) => Promise<void>;
  onRestart: (serverId: string) => Promise<void>;
}

export function MCPServerStatus({ server, onStart, onStop, onRestart }: MCPServerStatusProps) {
  const getStatusBadge = () => {
    switch (server.status) {
      case 'connected':
        return (
          <Badge variant="default" className="bg-green-100 text-green-800 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            Connected
          </Badge>
        );
      case 'disconnected':
        return (
          <Badge variant="secondary" className="bg-gray-100 text-gray-700 border-gray-200">
            <Square className="w-3 h-3 mr-1" />
            Disconnected
          </Badge>
        );
      case 'error':
        return (
          <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">
            <AlertCircle className="w-3 h-3 mr-1" />
            Error
          </Badge>
        );
      case 'starting':
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            Starting
          </Badge>
        );
      case 'stopping':
        return (
          <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">
            <Clock className="w-3 h-3 mr-1" />
            Stopping
          </Badge>
        );
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  const getActionButtons = () => {
    const isConnected = server.status === 'connected';
    const isTransitioning = server.status === 'starting' || server.status === 'stopping';

    return (
      <div className="flex space-x-2">
        {!isConnected && !isTransitioning && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onStart(server.id)}
            className="text-green-700 border-green-200 hover:bg-green-50"
          >
            <Play className="w-3 h-3 mr-1" />
            Start
          </Button>
        )}

        {isConnected && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onStop(server.id)}
            className="text-red-700 border-red-200 hover:bg-red-50"
          >
            <Square className="w-3 h-3 mr-1" />
            Stop
          </Button>
        )}

        {(isConnected || server.status === 'error') && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onRestart(server.id)}
            className="text-blue-700 border-blue-200 hover:bg-blue-50"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Restart
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="flex items-center justify-between p-3 border rounded-lg bg-white">
      <div className="flex-1">
        <div className="flex items-center space-x-3">
          <div>
            <h4 className="font-medium text-sm">{server.name}</h4>
            <p className="text-xs text-gray-500">{server.command}</p>
          </div>
          {getStatusBadge()}
        </div>

        {server.status === 'connected' && (
          <div className="mt-2 flex space-x-4 text-xs text-gray-600">
            <span>{server.toolCount} tools</span>
            <span>{server.resourceCount} resources</span>
            {server.lastConnected && <span>Connected: {new Date(server.lastConnected).toLocaleTimeString()}</span>}
          </div>
        )}

        {server.status === 'error' && server.lastError && (
          <div className="mt-2">
            <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">{server.lastError}</p>
          </div>
        )}
      </div>

      <div className="ml-4">{getActionButtons()}</div>
    </div>
  );
}
