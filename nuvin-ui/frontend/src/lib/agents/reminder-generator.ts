import type { Message } from '@/types';
import {
  SystemReminderGenerator,
  type MessageContext,
  type SystemReminder,
  type TodoStateForReminders,
} from './system-reminders';

export class ReminderGeneratorService {
  private generator: SystemReminderGenerator;

  constructor() {
    this.generator = new SystemReminderGenerator();
  }

  enhanceMessageWithReminders(
    messageContent: string,
    options: {
      conversationId?: string;
      messageHistory?: Message[];
      includeReminders?: boolean;
      todoState?: TodoStateForReminders;
    } = {},
  ): string[] {
    if (options.includeReminders === false) {
      return [messageContent];
    }

    const fileOps =
      SystemReminderGenerator.detectFileOperations(messageContent);
    const todoState =
      options.todoState ||
      SystemReminderGenerator.getTodoStateForContext(options.conversationId);

    const context: MessageContext = {
      conversationId: options.conversationId,
      messageContent,
      messageHistory: options.messageHistory || [],
      todoListState: todoState,
      hasFileReads: fileOps.hasFileReads,
      hasFileWrites: fileOps.hasFileWrites,
      hasCreateOperations: fileOps.hasCreateOperations,
      fileOperations: fileOps.fileOperations,
    };

    const reminders = this.generator.generateReminders(context);

    if (reminders.length === 0) {
      return [messageContent];
    }

    return this.injectRemindersIntoMessage([messageContent], reminders);
  }

  /**
   * Inject system reminders into message content following the pattern
   */
  private injectRemindersIntoMessage(
    messageContent: string[],
    reminders: SystemReminder[],
  ): string[] {
    const reminderBlocks =
      this.generator.formatRemindersForInjection(reminders);

    // Create the enhanced message structure
    if (reminderBlocks) {
      // return `${messageContent}\n\n${reminderBlocks}`;
      return messageContent;
    }
    return messageContent;
  }

  /**
   * Check if message content warrants system reminders
   */
  shouldIncludeReminders(messageContent: string): boolean {
    const content = messageContent.toLowerCase();

    // Always include core instructions
    return true;
  }

  /**
   * Get current todo state for reminders
   */
  getCurrentTodoState(conversationId?: string): TodoStateForReminders {
    return SystemReminderGenerator.getTodoStateForContext(conversationId);
  }

  /**
   * Generate specific reminder types for testing
   */
  generateSpecificReminder(
    type: 'todo-empty' | 'todo-changed' | 'security' | 'behavioral',
    context: Partial<MessageContext> = {},
  ): SystemReminder | null {
    const fullContext: MessageContext = {
      conversationId: '',
      messageContent: '',
      messageHistory: [],
      ...context,
    };

    switch (type) {
      case 'todo-empty':
        return this.generator['generateTodoStatusReminder']({
          todos: [],
          isEmpty: true,
          hasInProgress: false,
          recentChanges: false,
        });

      case 'todo-changed':
        return this.generator['generateTodoStatusReminder']({
          todos: [{ id: '1', content: 'Test', status: 'pending' }],
          isEmpty: false,
          hasInProgress: false,
          recentChanges: true,
        });

      case 'security':
        return this.generator['generateSecurityReminder']({
          ...fullContext,
          hasFileReads: true,
        });

      case 'behavioral':
        return this.generator['generateBehavioralReminder']({
          ...fullContext,
          messageContent: 'create a new file',
        });

      default:
        return null;
    }
  }
}

// Export singleton instance
export const reminderGenerator = new ReminderGeneratorService();
