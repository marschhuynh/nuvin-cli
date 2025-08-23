// Test setup specifically for agent tests
import { vi } from 'vitest';
import type { ToolCall } from '@/lib/providers/types/base';

// Mock Wails runtime to avoid import errors
vi.mock('@wails/runtime', () => ({
  LogInfo: vi.fn((message: string) => console.log('[MOCK] LogInfo:', message)),
  LogError: vi.fn((message: string) => console.error('[MOCK] LogError:', message)),
  EventsOn: vi.fn((eventName: string, _callback: (...args: any[]) => void) => {
    console.log('[MOCK] EventsOn:', eventName);
    return () => {}; // Return unsubscribe function
  }),
  EventsOff: vi.fn((eventName: string) => console.log('[MOCK] EventsOff:', eventName)),
}));

// Mock the Wails Go bindings
vi.mock('../../wailsjs/go/main/App', () => ({
  FetchProxy: vi.fn(() => Promise.resolve({ data: null, error: null })),
}));

// Mock the store dependencies
vi.mock('@/store/useTodoStore', () => ({
  useTodoStore: {
    getState: () => ({
      getTodoStateForReminders: () => ({
        todos: [],
        isEmpty: true,
        hasInProgress: false,
        recentChanges: false,
        allCompleted: false,
        completedCount: 0,
        totalCount: 0,
      }),
    }),
  },
}));

// Mock the reminder generator
vi.mock('@/lib/agents/reminder-generator', () => ({
  reminderGenerator: {
    enhanceMessageWithReminders: vi.fn((content) => [content]),
  },
}));

// Mock fetch-proxy to avoid Wails dependencies
vi.mock('@/lib/fetch-proxy', () => ({
  fetchProxy: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })),
}));

// Global test utilities for agent tests
export const createMockMessage = (role: 'user' | 'assistant' | 'tool', content: string, id?: string) => ({
  id: id || 'mock-id',
  role,
  content,
  timestamp: new Date().toISOString(),
});

export const createMockToolCall = (id: string, name: string, args: any = {}): ToolCall => ({
  id,
  type: 'function',
  function: {
    name,
    arguments: JSON.stringify(args),
  },
});

export const createMockToolResult = (id: string, name: string, result: any) => ({
  id,
  name,
  result: {
    status: 'success' as const,
    type: 'text' as const,
    result,
  },
});

export const createMockCompletionResult = (content: string, toolCalls?: any[], usage?: any) => ({
  content,
  tool_calls: toolCalls,
  usage: usage || {
    prompt_tokens: 10,
    completion_tokens: 5,
    total_tokens: 15,
  },
});
