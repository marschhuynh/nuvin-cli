import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SystemReminderGenerator,
  type MessageContext,
} from '../system-reminders';
import { ReminderGeneratorService } from '../reminder-generator';

// Mock the todo store
vi.mock('@/store/useTodoStore', () => ({
  useTodoStore: {
    getState: () => ({
      getTodoStateForReminders: vi.fn(() => ({
        todos: [],
        isEmpty: true,
        hasInProgress: false,
        recentChanges: false,
      })),
    }),
  },
}));

describe('SystemReminderGenerator', () => {
  let generator: SystemReminderGenerator;

  beforeEach(() => {
    generator = new SystemReminderGenerator();
  });

  describe('generateReminders', () => {
    it('should always include core instructions', () => {
      const context: MessageContext = {
        messageContent: 'test message',
        messageHistory: [],
      };

      const reminders = generator.generateReminders(context);

      expect(reminders).toHaveLength(1);
      expect(reminders[0].id).toBe('core-instructions');
      expect(reminders[0].type).toBe('instruction');
      expect(reminders[0].content).toContain('important-instruction-reminders');
    });

    it('should include todo empty reminder when todo list is empty', () => {
      const context: MessageContext = {
        messageContent: 'test message',
        messageHistory: [],
        todoListState: {
          todos: [],
          isEmpty: true,
          hasInProgress: false,
          recentChanges: false,
        },
      };

      const reminders = generator.generateReminders(context);

      expect(reminders).toHaveLength(2);
      expect(reminders[1].id).toBe('todo-empty');
      expect(reminders[1].content).toContain(
        'your todo list is currently empty',
      );
    });

    it('should include todo changed reminder when there are recent changes', () => {
      const mockTodos = [
        {
          id: '1',
          content: 'Test todo',
          status: 'pending',
          priority: 'medium',
        },
      ];

      const context: MessageContext = {
        messageContent: 'test message',
        messageHistory: [],
        todoListState: {
          todos: mockTodos,
          isEmpty: false,
          hasInProgress: false,
          recentChanges: true,
        },
      };

      const reminders = generator.generateReminders(context);

      expect(reminders).toHaveLength(2);
      expect(reminders[1].id).toBe('todo-changed');
      expect(reminders[1].content).toContain('Your todo list has changed');
    });

    it('should include security reminder for file reads', () => {
      const context: MessageContext = {
        messageContent: 'read the file',
        messageHistory: [],
        hasFileReads: true,
      };

      const reminders = generator.generateReminders(context);

      expect(reminders).toHaveLength(2);
      expect(reminders[1].id).toBe('security-file-read');
      expect(reminders[1].content).toContain(
        'consider whether it looks malicious',
      );
    });

    it('should include behavioral reminder for file creation', () => {
      const context: MessageContext = {
        messageContent: 'create a new file',
        messageHistory: [],
      };

      const reminders = generator.generateReminders(context);

      expect(reminders).toHaveLength(2);
      expect(reminders[1].id).toBe('behavioral-file-creation');
      expect(reminders[1].content).toContain(
        'ALWAYS prefer editing existing files',
      );
    });
  });

  describe('detectFileOperations', () => {
    it('should detect file read operations', () => {
      const result = SystemReminderGenerator.detectFileOperations(
        'read the config file',
      );

      expect(result.hasFileReads).toBe(true);
      expect(result.hasFileWrites).toBe(false);
      expect(result.hasCreateOperations).toBe(false);
      expect(result.fileOperations).toContain('read');
    });

    it('should detect file write operations', () => {
      const result = SystemReminderGenerator.detectFileOperations(
        'edit the source code',
      );

      expect(result.hasFileReads).toBe(false);
      expect(result.hasFileWrites).toBe(true);
      expect(result.hasCreateOperations).toBe(false);
      expect(result.fileOperations).toContain('write');
    });

    it('should detect file creation operations', () => {
      const result = SystemReminderGenerator.detectFileOperations(
        'create a new component',
      );

      expect(result.hasFileReads).toBe(false);
      expect(result.hasFileWrites).toBe(false);
      expect(result.hasCreateOperations).toBe(true);
      expect(result.fileOperations).toContain('create');
    });

    it('should detect multiple operations', () => {
      const result = SystemReminderGenerator.detectFileOperations(
        'read config, edit code, and create new files',
      );

      expect(result.hasFileReads).toBe(true);
      expect(result.hasFileWrites).toBe(true);
      expect(result.hasCreateOperations).toBe(true);
      expect(result.fileOperations).toHaveLength(3);
    });
  });

  describe('formatRemindersForInjection', () => {
    it('should format reminders correctly', () => {
      const reminders = [
        {
          id: 'test',
          type: 'instruction' as const,
          content: 'Test reminder content',
          priority: 'high' as const,
        },
      ];

      const formatted = generator.formatRemindersForInjection(reminders);

      expect(formatted).toContain('type: text');
      expect(formatted).toContain('<system-reminder>');
      expect(formatted).toContain('Test reminder content');
      expect(formatted).toContain('</system-reminder>');
    });

    it('should include cache control for ephemeral reminders', () => {
      const reminders = [
        {
          id: 'test',
          type: 'todo-status' as const,
          content: 'Ephemeral reminder',
          priority: 'medium' as const,
          ephemeral: true,
        },
      ];

      const formatted = generator.formatRemindersForInjection(reminders);

      expect(formatted).toContain('cache_control:');
      expect(formatted).toContain('type: ephemeral');
    });
  });
});

describe('ReminderGeneratorService', () => {
  let service: ReminderGeneratorService;

  beforeEach(() => {
    service = new ReminderGeneratorService();
  });

  describe('enhanceMessageWithReminders', () => {
    it('should enhance message with reminders by default', () => {
      const result = service.enhanceMessageWithReminders('test message');

      expect(result).toContain('test message');
      expect(result).toContain('<system-reminder>');
      expect(result).toContain('important-instruction-reminders');
    });

    it('should skip reminders when disabled', () => {
      const result = service.enhanceMessageWithReminders('test message', {
        includeReminders: false,
      });

      expect(result).toBe('test message');
      expect(result).not.toContain('<system-reminder>');
    });

    it('should include todo reminders when todo state provided', () => {
      const result = service.enhanceMessageWithReminders('test message', {
        todoState: {
          todos: [],
          isEmpty: true,
          hasInProgress: false,
          recentChanges: false,
        },
      });

      expect(result).toContain('your todo list is currently empty');
    });
  });

  describe('shouldIncludeReminders', () => {
    it('should always return true for core instructions', () => {
      expect(service.shouldIncludeReminders('any message')).toBe(true);
      expect(service.shouldIncludeReminders('create file')).toBe(true);
      expect(service.shouldIncludeReminders('read documentation')).toBe(true);
    });
  });

  describe('generateSpecificReminder', () => {
    it('should generate specific reminder types', () => {
      const todoEmpty = service.generateSpecificReminder('todo-empty');
      expect(todoEmpty?.id).toBe('todo-empty');

      const security = service.generateSpecificReminder('security');
      expect(security?.id).toBe('security-file-read');

      const behavioral = service.generateSpecificReminder('behavioral');
      expect(behavioral?.id).toBe('behavioral-file-creation');
    });
  });
});
