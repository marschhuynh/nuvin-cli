import { Conversation } from '@/types';
import { Trash2 } from 'lucide-react';
import { Button } from './ui/button';

interface ConversationItemProps {
  conversation: Conversation;
  onClick?: (conversationId: string) => void;
  onDelete?: (conversationId: string) => void;
}

export function ConversationItem({ conversation, onClick, onDelete }: ConversationItemProps) {
  const handleClick = () => {
    onClick?.(conversation.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering the conversation click
    onDelete?.(conversation.id);
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative mx-2 my-1 p-3 rounded-lg cursor-pointer transition-all duration-200 ${
        conversation.active
          ? 'bg-gradient-to-r from-primary/15 to-primary/10 border border-primary/30 ring-1 ring-primary/20 conversation-active'
          : 'hover:bg-muted/60 hover:border-border/60 border border-transparent'
      }`}
    >
      <div className={`font-medium text-sm truncate transition-colors duration-200 ${
        conversation.active ? 'text-primary' : 'text-foreground'
      }`}>
        {conversation.title}
      </div>
      <div className={`text-xs transition-colors duration-200 ${
        conversation.active ? 'text-primary/70' : 'text-muted-foreground'
      }`}>
        {conversation.timestamp}
      </div>
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          className={`h-8 w-8 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/10 ${
            conversation.active ? 'text-primary hover:text-destructive' : 'text-muted-foreground hover:text-destructive'
          }`}
          onClick={handleDelete}
        >
          <Trash2 className="h-full w-full" />
        </Button>
        {conversation.active && (
          <div className="w-1 h-8 bg-primary rounded-full"></div>
        )}
      </div>
    </div>
  );
}