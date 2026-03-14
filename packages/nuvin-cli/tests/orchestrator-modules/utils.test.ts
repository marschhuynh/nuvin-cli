import { describe, it, expect, vi } from 'vitest';
import { messageContentToText, messagesToText, SessionBoundMetricsPort } from '../../source/services/orchestrator-modules/utils.js';
import type { Message, MessageContent } from '@nuvin/nuvin-core';
import type { sessionMetricsService } from '../../source/services/SessionMetricsService.js';

describe('orchestrator-modules/utils', () => {
  describe('messageContentToText', () => {
    it('should return empty string for null content', () => {
      expect(messageContentToText(null)).toBe('');
    });

    it('should return string content as-is', () => {
      expect(messageContentToText('Hello world')).toBe('Hello world');
    });

    it('should extract text from parts-based content', () => {
      const content = {
        parts: [
          { type: 'text' as const, text: 'Hello' },
          { type: 'text' as const, text: 'world' },
        ],
      };
      expect(messageContentToText(content)).toBe('Hello world');
    });

    it('should filter out non-text parts', () => {
      const content = {
        parts: [
          { type: 'text' as const, text: 'Hello' },
          { type: 'image' as const, data: 'base64data', mimeType: 'image/png' },
          { type: 'text' as const, text: 'world' },
        ],
      };
      expect(messageContentToText(content as unknown as MessageContent)).toBe('Hello world');
    });
  });

  describe('messagesToText', () => {
    const messages: Message[] = [
      { id: '1', role: 'user', content: 'Hello', timestamp: '2024-01-01' },
      { id: '2', role: 'assistant', content: 'Hi there', timestamp: '2024-01-01' },
      { id: '3', role: 'tool', content: 'Tool result', timestamp: '2024-01-01' },
    ];

    it('should convert all messages to text with role labels', () => {
      const text = messagesToText(messages);
      expect(text).toContain('User: Hello');
      expect(text).toContain('Assistant: Hi there');
      expect(text).toContain('Tool: Tool result');
    });

    it('should separate messages with double newlines', () => {
      const text = messagesToText(messages);
      expect(text).toBe('User: Hello\n\nAssistant: Hi there\n\nTool: Tool result');
    });

    it('should filter by roles when rolesFilter is provided', () => {
      const text = messagesToText(messages, { rolesFilter: ['user'] });
      expect(text).toContain('User: Hello');
      expect(text).not.toContain('Assistant');
      expect(text).not.toContain('Tool');
    });

    it('should handle empty messages array', () => {
      expect(messagesToText([])).toBe('');
    });

    it('should handle parts-based content', () => {
      const msgs: Message[] = [
        {
          id: '1',
          role: 'user',
          content: { parts: [{ type: 'text', text: 'Hello from parts' }] },
          timestamp: '2024-01-01',
        },
      ];
      const text = messagesToText(msgs);
      expect(text).toBe('User: Hello from parts');
    });
  });

  describe('SessionBoundMetricsPort', () => {
    it('should delegate recordLLMCall to the service', () => {
      const mockService = {
        recordLLMCall: vi.fn(),
        recordToolCall: vi.fn(),
        recordRequestComplete: vi.fn(),
        setContextWindow: vi.fn(),
        reset: vi.fn(),
        getSnapshot: vi.fn().mockReturnValue({}),
      };

      const port = new SessionBoundMetricsPort('test-session', mockService as unknown as typeof sessionMetricsService);
      port.recordLLMCall({ prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });

      expect(mockService.recordLLMCall).toHaveBeenCalledWith('test-session', {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      }, undefined);
    });

    it('should delegate recordToolCall to the service', () => {
      const mockService = {
        recordLLMCall: vi.fn(),
        recordToolCall: vi.fn(),
        recordRequestComplete: vi.fn(),
        setContextWindow: vi.fn(),
        reset: vi.fn(),
        getSnapshot: vi.fn().mockReturnValue({}),
      };

      const port = new SessionBoundMetricsPort('test-session', mockService as unknown as typeof sessionMetricsService);
      port.recordToolCall();

      expect(mockService.recordToolCall).toHaveBeenCalledWith('test-session');
    });

    it('should delegate getSnapshot to the service', () => {
      const snapshot = { totalRequests: 5 };
      const mockService = {
        recordLLMCall: vi.fn(),
        recordToolCall: vi.fn(),
        recordRequestComplete: vi.fn(),
        setContextWindow: vi.fn(),
        reset: vi.fn(),
        getSnapshot: vi.fn().mockReturnValue(snapshot),
      };

      const port = new SessionBoundMetricsPort('test-session', mockService as unknown as typeof sessionMetricsService);
      expect(port.getSnapshot()).toBe(snapshot);
      expect(mockService.getSnapshot).toHaveBeenCalledWith('test-session');
    });
  });
});
