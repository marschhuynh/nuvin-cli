import { UserMessage } from './UserMessage';
import { AssistantMessage } from './AssistantMessage';
import { ToolCallMessage } from './ToolCallMessage';
import { useUserPreferenceStore } from '@/store/useUserPreferenceStore';
import type { MessageMetadata } from '@/types';

interface MessageProps {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp?: string;
  isStreaming?: boolean;
  metadata?: MessageMetadata;
  toolCall?: {
    name: string;
    id: string;
    description?: string;
    arguments: Record<string, unknown>;
    result?: {
      status: 'success' | 'error' | 'warning';
      type: 'text' | 'json';
      result: string | object;
      additionalResult?: Record<string, any>;
      metadata?: Record<string, unknown>;
    };
    isExecuting?: boolean;
  };
}

export function Message({
  id,
  role,
  content,
  isStreaming = false,
  metadata,
  toolCall,
}: MessageProps) {
  const { preferences } = useUserPreferenceStore();
  const trimmedContent = content.trim();

  if (trimmedContent.length === 0) return null;

  return (
    <div
      className={`flex gap-4 chat-message animate-in fade-in slide-in-from-bottom-2 duration-300 group ${
        role === 'user' ? 'justify-end' : 'justify-start'
      }`}
    >
      {role === 'user' ? (
        <UserMessage
          id={id}
          content={content}
          isStreaming={isStreaming}
          messageMode={preferences.messageMode}
        />
      ) : toolCall ? (
        <ToolCallMessage
          id={id}
          toolName={toolCall.name}
          description={toolCall.description}
          arguments={toolCall.arguments}
          result={toolCall.result}
          isExecuting={toolCall.isExecuting}
        />
      ) : (
        <AssistantMessage
          id={id}
          content={content}
          isStreaming={isStreaming}
          messageMode={preferences.messageMode}
          metadata={metadata}
        />
      )}
    </div>
  );
}
