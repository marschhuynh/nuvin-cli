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
      messageType?: 'user' | 'tool';
      conversationId?: string;
      messageHistory?: Message[];
      includeReminders?: boolean;
      todoState?: TodoStateForReminders;
    } = {},
  ): string[] {
    if (options.includeReminders === false) {
      return [messageContent];
    }

    const todoState = Object.assign(
      {},
      SystemReminderGenerator.getTodoStateForContext(options.conversationId),
      options.todoState,
    );

    console.log('DEBUG:todoState', todoState);

    const context: MessageContext = {
      messageType: options.messageType || 'tool',
      conversationId: options.conversationId,
      messageContent,
      messageHistory: options.messageHistory || [],
      todoListState: todoState,
    };

    const reminders = this.generator.generateReminders(context);

    console.log('DEBUG:reminders', reminders);

    if (reminders.length === 0) {
      return [messageContent];
    }

    return this.injectRemindersIntoMessage(messageContent, reminders);
  }

  /**
   * Inject system reminders into message content following the pattern
   * Order: high priority reminders, user message, then medium/low priority reminders
   */
  private injectRemindersIntoMessage(messageContent: string, reminders: SystemReminder[]): string[] {
    // Sort reminders by priority
    const priorityOrder = { high: 1, medium: 2, low: 3 };
    const sortedReminders = [...reminders].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // Separate high priority from others
    const highPriorityReminders = sortedReminders.filter((r) => r.priority === 'high');
    const otherReminders = sortedReminders.filter((r) => r.priority !== 'high');

    const result: string[] = [];

    // Add high priority reminders first
    if (highPriorityReminders.length > 0) {
      const highPriorityBlocks = this.generator.formatRemindersForInjection(highPriorityReminders);
      result.push(highPriorityBlocks);
    }

    // Add user message
    result.push(messageContent);

    // Add other reminders last
    if (otherReminders.length > 0) {
      const otherBlocks = this.generator.formatRemindersForInjection(otherReminders);
      result.push(otherBlocks);
    }

    return result;
  }

  /**
   * Check if message content warrants system reminders
   */
  shouldIncludeReminders(messageContent: string): boolean {
    const _content = messageContent.toLowerCase();

    // Always include core instructions
    return true;
  }

  /**
   * Get current todo state for reminders
   */
  getCurrentTodoState(conversationId?: string): TodoStateForReminders {
    return SystemReminderGenerator.getTodoStateForContext(conversationId);
  }
}

// Export singleton instance
export const reminderGenerator = new ReminderGeneratorService();
