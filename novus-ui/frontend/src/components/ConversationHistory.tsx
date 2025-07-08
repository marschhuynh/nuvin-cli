import { Button } from "@/components/ui/button";
import { Plus, History } from 'lucide-react';
import { ConversationItem } from './ConversationItem';
import { Conversation } from '@/types';

interface ConversationHistoryProps {
  conversations: Conversation[];
  onNewConversation?: () => void;
  onConversationSelect?: (conversationId: string) => void;
  onConversationDelete?: (conversationId: string) => void;
}

export function ConversationHistory({
  conversations,
  onNewConversation,
  onConversationSelect,
  onConversationDelete
}: ConversationHistoryProps) {
  return (
    <div className="w-80 border-r border-border bg-card">
      <div className="mx-2 mt-4">
        <Button
          className="w-full p-2 h-auto flex items-center justify-center gap-2"
          size="sm"
          onClick={onNewConversation}
        >
          <Plus className="h-4 w-4" />
          New Conversation
        </Button>
      </div>
      <div className="overflow-y-auto mt-4">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-muted-foreground px-4">
            <History className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm text-center">No conversations yet</p>
            <p className="text-xs text-center opacity-75">Click "New Conversation" to get started</p>
          </div>
        ) : (
          conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              onClick={onConversationSelect}
              onDelete={onConversationDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}