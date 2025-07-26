import { useState } from 'react';
import {
  Wrench,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import {
  ParsedToolCall,
  formatToolArguments,
} from '@/lib/utils/tool-call-parser';

interface ToolCallProps {
  toolCall: ParsedToolCall;
}

export function ToolCall({ toolCall }: ToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  const getStatusIcon = () => {
    if (!toolCall.result) {
      return <Clock className="w-4 h-4 text-yellow-600" />;
    }
    return toolCall.result.success ? (
      <CheckCircle className="w-4 h-4 text-green-600" />
    ) : (
      <XCircle className="w-4 h-4 text-red-600" />
    );
  };

  const getStatusText = () => {
    if (!toolCall.result) {
      return 'executing...';
    }
    return toolCall.result.success ? 'completed' : 'failed';
  };

  const getStatusColor = () => {
    if (!toolCall.result) {
      return 'text-yellow-600';
    }
    return toolCall.result.success ? 'text-green-600' : 'text-red-600';
  };

  return (
    <div className="border border-border/50 rounded-lg p-3 bg-muted/20 my-2">
      <div
        className="flex items-center gap-2 cursor-pointer hover:bg-muted/30 -m-1 p-1 rounded transition-colors"
        onClick={toggleExpanded}
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <Wrench className="w-4 h-4 text-blue-600" />
        <span className="font-medium text-sm">
          Tool:{' '}
          <code className="bg-muted px-1 py-0.5 rounded text-xs">
            {toolCall.name}
          </code>
        </span>
        <div className="flex items-center gap-1 ml-auto">
          {getStatusIcon()}
          <span className={`text-xs font-medium ${getStatusColor()}`}>
            {getStatusText()}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">ID: {toolCall.id}</span>
      </div>

      {isExpanded && (
        <div className="mt-3 pl-6 border-l-2 border-blue-600/20">
          <div className="space-y-3">
            {/* Input/Arguments Section */}
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                <span>Input:</span>
              </div>
              <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto border">
                {formatToolArguments(toolCall.arguments)}
              </pre>
            </div>

            {/* Output/Result Section */}
            {toolCall.result && (
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <span>Output:</span>
                  {toolCall.result.success ? (
                    <CheckCircle className="w-3 h-3 text-green-600" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-600" />
                  )}
                </div>
                <div
                  className={`text-xs p-2 rounded border ${
                    toolCall.result.success
                      ? 'bg-green-50/50 border-green-200/50'
                      : 'bg-red-50/50 border-red-200/50'
                  }`}
                >
                  {toolCall.result.success ? (
                    <div>
                      {toolCall.result.data && (
                        <pre className="whitespace-pre-wrap overflow-x-auto">
                          {typeof toolCall.result.data === 'string'
                            ? toolCall.result.data
                            : JSON.stringify(toolCall.result.data, null, 2)}
                        </pre>
                      )}
                      {toolCall.result.metadata && (
                        <div className="mt-2 pt-2 border-t border-green-200/30">
                          <div className="text-xs text-muted-foreground mb-1">
                            Metadata:
                          </div>
                          <pre className="text-xs opacity-70">
                            {JSON.stringify(toolCall.result.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div>
                      <div className="text-red-700 font-medium">
                        Error: {toolCall.result.error || 'Unknown error'}
                      </div>
                      {toolCall.result.data && (
                        <div className="mt-2">
                          <div className="text-xs text-muted-foreground mb-1">
                            Details:
                          </div>
                          <pre className="text-xs opacity-70">
                            {typeof toolCall.result.data === 'string'
                              ? toolCall.result.data
                              : JSON.stringify(toolCall.result.data, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
