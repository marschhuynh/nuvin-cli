import {
  Wrench,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronRight,
  Clock,
} from 'lucide-react';
import { useState, useCallback } from 'react';
import { ClipboardSetText } from '../../../wailsjs/runtime/runtime';
import { Copy, Check } from 'lucide-react';

interface ToolCallMessageProps {
  toolName: string;
  toolId: string;
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
  toolId,
  arguments: args,
  result,
  isExecuting = false,
}: ToolCallMessageProps) {
  const [copied, setCopied] = useState(false);
  const [showArguments, setShowArguments] = useState(false);
  const [showResult, setShowResult] = useState(true);

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

  const getStatusColor = () => {
    if (isExecuting) return 'text-blue-600 dark:text-blue-400';
    if (result?.success) return 'text-green-600 dark:text-green-400';
    if (result?.success === false) return 'text-red-600 dark:text-red-400';
    return 'text-gray-500 dark:text-gray-400';
  };

  return (
    <>
      {/* Tool icon */}
      <div className="h-8 w-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
        <Wrench className="h-4 w-4 text-white" />
      </div>

      {/* Tool call bubble */}
      <div className="relative max-w-[80%] sm:max-w-[70%]">
        <div className="rounded-lg bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-800/60 shadow-xs">
          {/* Header */}
          <div className="px-4 py-3 border-b border-blue-200/40 dark:border-blue-800/40">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {getStatusIcon()}
                  <h3 className="font-semibold text-blue-800 dark:text-blue-200">
                    {toolName}
                  </h3>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${getStatusColor()} ${
                    isExecuting
                      ? 'bg-blue-100 dark:bg-blue-900/50'
                      : result?.success
                        ? 'bg-green-100 dark:bg-green-900/50'
                        : result?.success === false
                          ? 'bg-red-100 dark:bg-red-900/50'
                          : 'bg-gray-100 dark:bg-gray-800/50'
                  }`}
                >
                  {getStatusText()}
                </span>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-3">
            {/* Arguments Section */}
            <div>
              <button
                type="button"
                onClick={() => setShowArguments(!showArguments)}
                className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
              >
                {showArguments ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
                Arguments
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                  {Object.keys(args || {}).length} parameters
                </span>
              </button>

              {showArguments && (
                <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-md border border-gray-200/60 dark:border-gray-700/60">
                  <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-auto leading-relaxed">
                    {formatJSON(args)}
                  </pre>
                </div>
              )}
            </div>

            {/* Result Section */}
            {result && (
              <div>
                <button
                  type="button"
                  onClick={() => setShowResult(!showResult)}
                  className="flex items-center gap-2 w-full text-left text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                >
                  {showResult ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                  Result
                  {result.success ? (
                    <CheckCircle className="h-3 w-3 text-green-500 ml-auto" />
                  ) : (
                    <XCircle className="h-3 w-3 text-red-500 ml-auto" />
                  )}
                </button>

                {showResult && (
                  <div className="mt-2">
                    <div
                      className={`p-3 rounded-md border text-xs ${
                        result.success
                          ? 'bg-green-50 dark:bg-green-900/20 border-green-200/60 dark:border-green-800/60 text-green-800 dark:text-green-200'
                          : 'bg-red-50 dark:bg-red-900/20 border-red-200/60 dark:border-red-800/60 text-red-800 dark:text-red-200'
                      }`}
                    >
                      {result.success ? (
                        result.data ? (
                          <pre className="leading-relaxed overflow-auto">
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
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Copy button */}
      <div className="flex flex-col self-start mt-2 gap-1 z-10 opacity-0 group-hover:opacity-100 transition-all duration-200">
        <button
          type="button"
          onClick={handleCopy}
          className={`p-1.5 rounded-md transition-all duration-200 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 backdrop-blur-sm border border-gray-200/50 dark:border-gray-700/50 shadow-sm bg-white/80 dark:bg-gray-900/80 ${
            copied
              ? 'scale-105 bg-green-50 dark:bg-green-900/50 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800'
              : ''
          }`}
          title="Copy tool call details"
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
