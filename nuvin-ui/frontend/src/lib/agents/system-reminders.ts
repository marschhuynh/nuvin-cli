import type { Message } from '@/types';
import { useTodoStore } from '@/store/useTodoStore';
import { ToolCallResult } from '../tools';

export interface SystemReminder {
  id: string;
  type: 'instruction' | 'todo-status' | 'security' | 'behavioral' | 'context';
  content: string;
  priority: 'high' | 'medium' | 'low';
  condition?: (context: MessageContext) => boolean;
  ephemeral?: boolean; // For cache control
}

export interface MessageContext {
  messageType: 'user' | 'tool';
  conversationId?: string;
  messageContent: string;
  messageHistory: Message[];
  activeTools?: string[];
  fileOperations?: string[];
  todoListState?: TodoStateForReminders;
  userPreferences?: UserPreferences;
  toolResults?: ToolCallResult[];
}

export interface TodoStateForReminders {
  todos?: any[];
  isEmpty?: boolean;
  hasInProgress?: boolean;
  recentChanges?: boolean;
}

export interface UserPreferences {
  preferExistingFiles?: boolean;
  avoidDocumentationFiles?: boolean;
  securityChecksEnabled?: boolean;
}

export class SystemReminderGenerator {
  private static readonly CORE_INSTRUCTIONS: SystemReminder = {
    id: 'core-instructions',
    type: 'instruction',
    content: `As you answer the user's questions, you can use the following context:
    # important-instruction-reminders
    Do what has been asked; nothing more, nothing less.
    NEVER create files unless they're absolutely necessary for achieving your goal.
    ALWAYS prefer editing an existing file to creating a new one.
    NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.


    IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.`,
    priority: 'high',
  };

  generateReminders(context: MessageContext): SystemReminder[] {
    const reminders: SystemReminder[] = [
      context.messageType === 'user'
        ? SystemReminderGenerator.CORE_INSTRUCTIONS
        : null,
    ].filter(Boolean) as SystemReminder[];

    // Todo list status reminders
    if (context.todoListState) {
      const todoReminder = this.generateTodoStatusReminder(
        context.todoListState,
      );
      if (todoReminder) {
        reminders.push(...todoReminder);
      }
    }

    return reminders;
  }

  private generateTodoStatusReminder(
    todoState: TodoStateForReminders,
  ): SystemReminder[] | null {
    if (todoState.isEmpty) {
      return [
        {
          id: 'todo-empty',
          type: 'todo-status',
          content: `This is a reminder that your todo list is currently empty. DO NOT mention this to the user explicitly because they are already aware. If you are working on tasks that would benefit from a todo list please use the TodoWrite tool to create one. If not, please feel free to ignore. Again do not mention this message to the user`,
          priority: 'medium',
        },
      ];
    }

    //     if (todoState.recentChanges && todoState?.todos?.length) {
    //       // Format todo list with status indicators
    //       const todoListForReminder = todoState?.todos?.map((item, index) => {
    //         const statusLabel = item.status === 'completed' ? '[completed]' :
    //           item.status === 'in_progress' ? '[in_progress]' :
    //             '[pending]';
    //         return `${index + 1}. ${statusLabel} ${item.content}`;
    //       }).join('\n');

    //       return [{
    //         id: 'todo-changed',
    //         type: 'todo-status',
    //         content: `Your todo list has changed. DO NOT mention this explicitly to the user. Here are the latest contents of your todo list:

    // [${todoListForReminder}]. Continue on with the tasks at hand if applicable.`,
    //         priority: 'medium',
    //       }];
    //     }

    // Only include status if there are items and they're relevant
    if (Number(todoState?.todos?.length) > 0 && todoState?.hasInProgress) {
      return [
        {
          id: 'todo-status',
          type: 'todo-status',
          content: `Current todo list status: ${todoState?.todos?.length} items (${todoState?.todos?.filter((t: any) => t.status === 'in_progress').length} in progress). Continue working on active tasks.`,
          priority: 'low',
        },
      ];
    }

    return null;
  }

  /**
   * Format reminders for injection into message content
   */
  formatRemindersForInjection(reminders: SystemReminder[]): string {
    if (reminders.length === 0) return '';

    const reminderBlocks = reminders.map((reminder) => {
      let block = '';

      block += `<system-reminder>`;
      block += `${reminder.content}`;
      block += `</system-reminder>`;

      return block;
    });

    return reminderBlocks.join('\n\n');
  }

  /**
   * Get todo state for a specific conversation
   */
  static getTodoStateForContext(
    conversationId?: string,
  ): TodoStateForReminders {
    const todoStore = useTodoStore.getState();
    return todoStore.getTodoStateForReminders(conversationId);
  }
}
