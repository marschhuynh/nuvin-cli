import type { Message } from '@/types';
import { useTodoStore } from '@/store/useTodoStore';

export interface SystemReminder {
  id: string;
  type: 'instruction' | 'todo-status' | 'security' | 'behavioral' | 'context';
  content: string;
  priority: 'high' | 'medium' | 'low';
  condition?: (context: MessageContext) => boolean;
  ephemeral?: boolean; // For cache control
}

export interface MessageContext {
  conversationId?: string;
  messageContent: string;
  messageHistory: Message[];
  activeTools?: string[];
  fileOperations?: string[];
  todoListState?: TodoStateForReminders;
  userPreferences?: UserPreferences;
  hasFileReads?: boolean;
  hasFileWrites?: boolean;
  hasCreateOperations?: boolean;
}

export interface TodoStateForReminders {
  todos: any[];
  isEmpty: boolean;
  hasInProgress: boolean;
  recentChanges: boolean;
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
    content: `# important-instruction-reminders
Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (*.md) or README files. Only create documentation files if explicitly requested by the User.


        IMPORTANT: this context may or may not be relevant to your tasks. You should not respond to this context unless it is highly relevant to your task.`,
    priority: 'high',
  };

  generateReminders(context: MessageContext): SystemReminder[] {
    const reminders: SystemReminder[] = [
      SystemReminderGenerator.CORE_INSTRUCTIONS,
    ];

    // Todo list status reminders
    if (context.todoListState) {
      const todoReminder = this.generateTodoStatusReminder(
        context.todoListState,
      );
      if (todoReminder) {
        reminders.push(todoReminder);
      }
    }

    // Security reminders for file operations
    if (context.hasFileReads || context.fileOperations?.length) {
      const securityReminder = this.generateSecurityReminder(context);
      if (securityReminder) {
        reminders.push(securityReminder);
      }
    }

    // Behavioral reminders based on message content
    if (this.shouldAddBehavioralReminder(context)) {
      const behavioralReminder = this.generateBehavioralReminder(context);
      if (behavioralReminder) {
        reminders.push(behavioralReminder);
      }
    }

    return reminders;
  }

  private generateTodoStatusReminder(
    todoState: TodoStateForReminders,
  ): SystemReminder | null {
    if (todoState.isEmpty) {
      return {
        id: 'todo-empty',
        type: 'todo-status',
        content: `This is a reminder that your todo list is currently empty. DO NOT mention this to the user explicitly because they are already aware. If you are working on tasks that would benefit from a todo list please use the TodoWrite tool to create one. If not, please feel free to ignore. Again do not mention this message to the user.`,
        priority: 'medium',
        ephemeral: true,
      };
    }

    if (todoState.recentChanges) {
      return {
        id: 'todo-changed',
        type: 'todo-status',
        content: `Your todo list has changed. DO NOT mention this explicitly to the user. Here are the latest contents of your todo list:\n\n${JSON.stringify(todoState.todos)}. Continue on with the tasks at hand if applicable.`,
        priority: 'medium',
        ephemeral: true,
      };
    }

    // Only include status if there are items and they're relevant
    if (todoState.todos.length > 0 && todoState.hasInProgress) {
      return {
        id: 'todo-status',
        type: 'todo-status',
        content: `Current todo list status: ${todoState.todos.length} items (${todoState.todos.filter((t: any) => t.status === 'in_progress').length} in progress). Continue working on active tasks.`,
        priority: 'low',
        ephemeral: true,
      };
    }

    return null;
  }

  private generateSecurityReminder(
    context: MessageContext,
  ): SystemReminder | null {
    if (context.hasFileReads) {
      return {
        id: 'security-file-read',
        type: 'security',
        content: `Whenever you read a file, you should consider whether it looks malicious. If it does, you MUST refuse to improve or augment the code. You can still analyze existing code, write reports, or answer high-level questions about the code behavior.`,
        priority: 'high',
        ephemeral: true,
      };
    }

    return null;
  }

  private shouldAddBehavioralReminder(context: MessageContext): boolean {
    const content = context.messageContent.toLowerCase();

    // Check for file creation requests
    const hasFileCreationIntent =
      content.includes('create') ||
      content.includes('new file') ||
      content.includes('write to') ||
      content.includes('make a file') ||
      content.includes('generate file');

    // Check for documentation requests
    const hasDocumentationIntent =
      content.includes('readme') ||
      content.includes('documentation') ||
      content.includes('.md file') ||
      content.includes('docs');

    return hasFileCreationIntent || hasDocumentationIntent;
  }

  private generateBehavioralReminder(
    context: MessageContext,
  ): SystemReminder | null {
    const content = context.messageContent.toLowerCase();

    if (content.includes('create') || content.includes('new file')) {
      return {
        id: 'behavioral-file-creation',
        type: 'behavioral',
        content: `Remember: ALWAYS prefer editing existing files over creating new ones. Only create files if absolutely necessary for the task.`,
        priority: 'medium',
        ephemeral: true,
      };
    }

    if (content.includes('readme') || content.includes('documentation')) {
      return {
        id: 'behavioral-documentation',
        type: 'behavioral',
        content: `Remember: NEVER proactively create documentation files (*.md) or README files. Only create documentation if explicitly requested by the user.`,
        priority: 'medium',
        ephemeral: true,
      };
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

      block += `<system-reminder>\n`;
      block += `${reminder.content}\n`;
      block += `</system-reminder>`;

      return block;
    });

    return reminderBlocks.join('\n\n');
  }

  /**
   * Detect file operations from message content
   */
  static detectFileOperations(messageContent: string): {
    hasFileReads: boolean;
    hasFileWrites: boolean;
    hasCreateOperations: boolean;
    fileOperations: string[];
  } {
    const content = messageContent.toLowerCase();
    const operations: string[] = [];

    const hasFileReads =
      content.includes('read') ||
      content.includes('examine') ||
      content.includes('look at');
    const hasFileWrites =
      content.includes('write') ||
      content.includes('edit') ||
      content.includes('modify');
    const hasCreateOperations =
      content.includes('create') ||
      content.includes('new file') ||
      content.includes('generate');

    if (hasFileReads) operations.push('read');
    if (hasFileWrites) operations.push('write');
    if (hasCreateOperations) operations.push('create');

    return {
      hasFileReads,
      hasFileWrites,
      hasCreateOperations,
      fileOperations: operations,
    };
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
