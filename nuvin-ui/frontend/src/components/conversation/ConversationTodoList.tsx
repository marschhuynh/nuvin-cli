import { useState, useEffect } from 'react';
import { useTodoStore } from '@/store/useTodoStore';
import { useConversationStore } from '@/store/useConversationStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle2, Circle, Clock, ChevronDown, ChevronRight, ListTodo } from 'lucide-react';
import type { TodoItem } from '@/types';

interface ConversationTodoListProps {
  className?: string;
}

export function ConversationTodoList({ className }: ConversationTodoListProps) {
  const { activeConversationId } = useConversationStore();
  const { getTodos, getTodoStats } = useTodoStore();

  // Get todos for the current conversation
  const todos = activeConversationId ? getTodos(activeConversationId) : [];
  const stats = activeConversationId ? getTodoStats(activeConversationId) : null;

  // Check if there are any uncompleted items
  const hasUncompletedItems = todos.some((todo) => todo.status !== 'completed');

  // Auto-expand if there are uncompleted items
  const [isOpen, setIsOpen] = useState(false);

  // Update isOpen when hasUncompletedItems changes
  useEffect(() => {
    setIsOpen(hasUncompletedItems);
  }, [hasUncompletedItems]);

  // Don't render if no active conversation or no todos
  if (!activeConversationId || todos.length === 0) {
    return null;
  }

  const getStatusIcon = (status: TodoItem['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-3 w-3 text-green-500" />;
      case 'in_progress':
        return <Clock className="h-3 w-3 text-blue-500" />;
      default:
        return <Circle className="h-3 w-3 text-muted-foreground" />;
    }
  };

  return (
    <Card className={className}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-2 pt-2 px-3 cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="text-xs font-medium flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <ListTodo className="h-3 w-3 text-muted-foreground" />
                <span>Todo List</span>
                {stats && (
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                    {stats.completed}/{stats.total}
                  </span>
                )}
              </div>
              <Button variant="ghost" size="sm" className="h-3 w-3 p-0">
                {isOpen ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />}
              </Button>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <CardContent className="pt-0 px-3 pb-2">
            {/* Todo Items */}
            <div className="space-y-1">
              {todos.map((todo) => (
                <div
                  key={todo.id}
                  className="flex items-center gap-2 text-xs hover:bg-muted/30 transition-colors rounded px-1 py-0.5"
                >
                  <div className="flex-shrink-0">{getStatusIcon(todo.status)}</div>
                  <span className={`flex-1 ${todo.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                    {todo.content}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
