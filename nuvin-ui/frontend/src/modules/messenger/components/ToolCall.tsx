import { useState } from 'react';
import { Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import { ParsedToolCall, formatToolArguments } from '@/lib/utils/tool-call-parser';

interface ToolCallProps {
  toolCall: ParsedToolCall;
}

export function ToolCall({ toolCall }: ToolCallProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
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
          Called tool: <code className="bg-muted px-1 py-0.5 rounded text-xs">{toolCall.name}</code>
        </span>
        <span className="text-xs text-muted-foreground">ID: {toolCall.id}</span>
      </div>
      
      {isExpanded && (
        <div className="mt-3 pl-6 border-l-2 border-blue-600/20">
          <div className="space-y-2">
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1">
                Arguments:
              </div>
              <pre className="text-xs bg-muted/50 p-2 rounded overflow-x-auto border">
                {formatToolArguments(toolCall.arguments)}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}