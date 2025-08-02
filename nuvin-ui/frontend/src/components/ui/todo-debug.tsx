import { useTodoStore } from '@/store/useTodoStore';
import { reminderGenerator } from '@/lib/agents/reminder-generator';
import { SystemReminderGenerator } from '@/lib/agents/system-reminders';

interface TodoDebugProps {
  conversationId?: string;
  messageContent?: string;
}

/**
 * Debug component to visualize system reminders and todo state
 * Only renders in development mode
 */
export const TodoDebug: React.FC<TodoDebugProps> = ({
  conversationId,
  messageContent = 'test message',
}) => {
  const todoStore = useTodoStore();

  // Only render in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const todoState = todoStore.getTodoStateForReminders(conversationId);
  const fileOps = SystemReminderGenerator.detectFileOperations(messageContent);

  const enhancedMessage = reminderGenerator.enhanceMessageWithReminders(
    messageContent,
    {
      conversationId,
      messageHistory: [],
      todoState,
    },
  );

  return (
    <div className="fixed bottom-4 right-4 bg-gray-900 text-white p-4 rounded-lg max-w-md max-h-96 overflow-auto text-xs z-50">
      <h3 className="font-bold mb-2">System Reminders Debug</h3>

      <div className="mb-3">
        <h4 className="font-semibold text-yellow-400">Todo State:</h4>
        <pre className="text-xs overflow-auto">
          {JSON.stringify(todoState, null, 2)}
        </pre>
      </div>

      <div className="mb-3">
        <h4 className="font-semibold text-blue-400">File Operations:</h4>
        <pre className="text-xs overflow-auto">
          {JSON.stringify(fileOps, null, 2)}
        </pre>
      </div>

      <div className="mb-3">
        <h4 className="font-semibold text-green-400">
          Enhanced Message Preview:
        </h4>
        <pre className="text-xs overflow-auto whitespace-pre-wrap border border-gray-600 p-2 rounded">
          {/* {enhancedMessage.substring(0, 500)} */}
          {enhancedMessage.length > 500 && '...'}
        </pre>
      </div>

      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={() => console.log('Todo State:', todoState)}
          className="px-2 py-1 bg-blue-600 rounded text-xs"
        >
          Log Todo State
        </button>
        <button
          type="button"
          onClick={() => console.log('Enhanced Message:', enhancedMessage)}
          className="px-2 py-1 bg-green-600 rounded text-xs"
        >
          Log Enhanced
        </button>
      </div>
    </div>
  );
};

export default TodoDebug;
