import {
  Wrench,
  CheckCircle,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { useState, useCallback } from 'react';
import { ClipboardSetText } from '../../../wailsjs/runtime/runtime';
import { Copy, Check } from 'lucide-react';

interface ToolCallMessageProps {
  toolName: string;
  arguments: any;
  result?: {
    success: boolean;
    data?: any;
    error?: string;
    metadata?: Record<string, any>;
  };
  isExecuting?: boolean;
}

export function ToolCallMessage({
  toolName,
  arguments: args,
  result,
  isExecuting = false,
}: ToolCallMessageProps) {
  const [copied, setCopied] = useState(false);
  const [showToolDetail, setShowToolDetail] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      const content = `Tool: ${toolName}\nArguments: ${JSON.stringify(args, null, 2)}${
        result ? `\nResult: ${JSON.stringify(result, null, 2)}` : ''
      }`;

      if (typeof ClipboardSetText === 'function') {
        await ClipboardSetText(content);
      } else {
        await navigator.clipboard.writeText(content);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy tool call:', error);
    }
  }, [toolName, args, result]);

  const formatJSON = useCallback((data: any) => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  }, []);

  const getStatusIcon = () => {
    if (isExecuting) {
      return <Clock className="h-4 w-4 text-blue-500 animate-pulse" />;
    }
    if (result?.success) {
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    }
    if (result?.success === false) {
      return <XCircle className="h-4 w-4 text-red-500" />;
    }
    return <Wrench className="h-4 w-4 text-gray-400" />;
  };

  const getStatusText = () => {
    if (isExecuting) return 'Executing...';
    if (result?.success) return 'Completed';
    if (result?.success === false) return 'Failed';
    return 'Pending';
  };

  return (
    <>
      {/* Tool icon */}
      <div className="h-8 w-8 bg-green-400 rounded-full flex items-center justify-center flex-shrink-0">
        <Wrench className="h-4 w-4 text-white" />
      </div>

      {/* Tool call card - compact linear layout */}
      <div className="relative max-w-[70%]">
        <div className="rounded-lg bg-card border-border hover:shadow-xs hover:border-border/80 shadow-xxs border transition-all duration-300">
          {!showToolDetail ? (
            /* Compact linear view: icon > name > status > collapse */
            <div className="px-3 py-2.5">
              <div className="flex items-center gap-3">
                {/* Status icon */}
                {getStatusIcon()}

                {/* Tool name */}
                <span className="font-medium text-foreground text-sm">
                  {toolName}
                </span>

                {/* Status badge */}
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    isExecuting
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                      : result?.success
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                        : result?.success === false
                          ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                          : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {getStatusText()}
                </span>

                {/* Collapse controls */}
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowToolDetail(!showToolDetail)}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-muted/50"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Expanded view */
            <>
              {/* Header */}
              <div className="px-3 py-2.5 border-b border-border/50">
                <div className="flex items-center gap-3">
                  {getStatusIcon()}
                  <span className="font-medium text-foreground text-sm">
                    {toolName}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      isExecuting
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                        : result?.success
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'
                          : result?.success === false
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'
                            : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {getStatusText()}
                  </span>

                  {/* Collapse controls */}
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      type="button"
                      onClick={() => setShowToolDetail(!showToolDetail)}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-1 py-0.5 rounded hover:bg-muted/50"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Content */}
              <div className="p-3 space-y-3">
                {/* Arguments Section */}
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">
                      Arguments
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {Object.keys(args || {}).length} parameters
                    </span>
                  </div>

                  <div className="mt-2 p-3 bg-muted/50 rounded border border-border">
                    <pre className="text-xs text-foreground overflow-auto leading-relaxed font-mono">
                      {formatJSON(args)}
                    </pre>
                  </div>
                </div>

                {/* Result Section */}
                {result && (
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">
                        Result
                      </span>
                      {result.success ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                    </div>

                    <div className="mt-2">
                      <div
                        className={`p-3 rounded border text-sm ${
                          result.success
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/50 text-green-800 dark:text-green-200'
                            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/50 text-red-800 dark:text-red-200'
                        }`}
                      >
                        {result.success ? (
                          result.data ? (
                            <pre className="overflow-auto leading-relaxed font-mono text-xs">
                              {formatJSON(result.data)}
                            </pre>
                          ) : (
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4" />
                              <span>Operation completed successfully</span>
                            </div>
                          )
                        ) : (
                          <div className="flex items-center gap-2">
                            <XCircle className="h-4 w-4" />
                            <span>{result.error || 'Operation failed'}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Copy button */}
      <div className="flex flex-col self-end gap-1 z-10 opacity-1 group-hover:opacity-100 transition-all duration-200">
        <button
          type="button"
          onClick={handleCopy}
          className={`p-1.5 rounded-md transition-all duration-200 hover:bg-muted text-muted-foreground backdrop-blur-sm border border-border/50 shadow-sm bg-background/80 ${
            copied ? 'scale-110 bg-green-100/80 text-green-600' : ''
          }`}
          title="Copy tool call"
        >
          {copied ? (
            <Check className="h-4 w-4" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </button>
      </div>
    </>
  );
}
