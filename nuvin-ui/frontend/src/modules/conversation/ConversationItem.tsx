import { Conversation } from '@/types';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatRelativeTime } from '@/lib/timestamp';

interface ConversationItemProps {
  conversation: Conversation;
  onClick?: (conversationId: string) => void;
  onDelete?: (conversationId: string) => void;
}

export function ConversationItem({
  conversation,
  onClick,
  onDelete,
}: ConversationItemProps) {
  const handleClick = () => {
    onClick?.(conversation.id);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(conversation.id);
  };

  return (
    <div
      onClick={handleClick}
      className={`group relative mx-2 my-1 px-3 py-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
        conversation.active
          ? 'bg-accent/80 border border-primary/40 shadow-sm'
          : 'hover:bg-muted/50 border border-transparent'
      }`}
    >
      <div className="flex items-start gap-2 relative">
        <div className="flex-1 min-w-0 pr-8">
          <div
            className={`font-medium text-sm truncate transition-colors duration-200 ${
              conversation.active ? 'text-foreground' : 'text-foreground'
            }`}
          >
            {conversation.summary || conversation.title}
          </div>
          <div
            className={`text-xs transition-colors duration-200 ${
              conversation.active ? 'text-muted-foreground/80' : 'text-muted-foreground'
            }`}
          >
            {formatRelativeTime(conversation.timestamp)}
          </div>
        </div>
        <div className="absolute top-0 right-0 flex items-center">
          <Button
            variant="ghost"
            size="icon"
            className={`h-7 w-7 p-1 opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-destructive/20 ${
              conversation.active
                ? 'text-muted-foreground hover:text-destructive'
                : 'text-muted-foreground hover:text-destructive'
            }`}
            onClick={handleDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
