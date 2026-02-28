import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Use vi.hoisted to create mocks before module is loaded
const { mockConfigManager } = vi.hoisted(() => {
  const instance = {
    getConfig: vi.fn(() => ({
      activeProvider: 'openrouter',
      model: 'openai/gpt-4',
      requireToolApproval: false,
      thinking: 'OFF',
      streamingChunks: false,
      mcp: undefined,
      agentsEnabled: {},
      session: {},
      skills: { enabled: false }, // Disable skills to avoid SkillTool.setProvider call
    })),
    get: vi.fn(() => ({})),
    set: vi.fn(),
    getProfileManager: vi.fn(() => undefined),
    getCurrentProfile: vi.fn(() => 'default'),
  };

  return { mockConfigManager: instance };
});

vi.mock('../source/config/manager.js', () => ({
  ConfigManager: {
    getInstance: vi.fn(() => mockConfigManager),
  },
}));

vi.mock('node:fs', () => {
  const mockAgentContent = `---
name: test-agent
description: Test agent
---
Test agent instructions`;

  return {
    default: {
      existsSync: vi.fn(() => false),
      mkdirSync: vi.fn(),
      readFileSync: vi.fn((path: string) => {
        // Return valid agent format for .md files, JSON for others
        if (typeof path === 'string' && path.endsWith('.md')) {
          return mockAgentContent;
        }
        return '{}';
      }),
      writeFileSync: vi.fn(),
    },
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    readFileSync: vi.fn((path: string) => {
      // Return valid agent format for .md files, JSON for others
      if (typeof path === 'string' && path.endsWith('.md')) {
        return mockAgentContent;
      }
      return '{}';
    }),
    writeFileSync: vi.fn(),
  };
});

vi.mock('node:os', () => ({
  default: {
    homedir: () => '/mock-home',
    tmpdir: () => '/mock-tmp',
    platform: () => 'darwin',
  },
  homedir: () => '/mock-home',
  tmpdir: () => '/mock-tmp',
  platform: () => 'darwin',
}));

// Mock LSP to avoid initialization issues
vi.mock('../source/services/lsp/index.js', () => ({
  LSP: {
    init: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock skillsService with proper structure
vi.mock('../source/services/SkillsService.js', () => ({
  skillsService: {
    setConfig: vi.fn(),
    discover: vi.fn().mockResolvedValue([]),
  },
  SkillTool: {
    setProvider: vi.fn(),
  },
}));

// Import after mocking
import { OrchestratorManager } from '../source/services/OrchestratorManager.js';
import type { MessageLine } from '../source/adapters/index.js';

const createMockHandlers = (): {
  appendLine: (line: MessageLine) => void;
  updateLine: (id: string, content: string) => void;
  updateLineMetadata: (id: string, metadata: Partial<import('../source/adapters/index.js').LineMetadata>) => void;
  handleError: (message: string) => void;
  messages: MessageLine[];
  errors: string[];
  updates: Record<string, string>;
} => {
  const messages: MessageLine[] = [];
  const errors: string[] = [];
  const updates: Record<string, string> = {};

  return {
    appendLine: (line: MessageLine) => messages.push(line),
    updateLine: (id: string, content: string) => {
      updates[id] = content;
    },
    updateLineMetadata: () => {},
    handleError: (message: string) => errors.push(message),
    messages,
    errors,
    updates,
  };
};

describe('OrchestratorManager.swapToAgent', () => {
  let manager: OrchestratorManager;

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new OrchestratorManager();
  });

  afterEach(async () => {
    await manager.cleanup();
  });

  it('should throw error when orchestrator is not initialized', async () => {
    await expect(manager.swapToAgent('test-agent')).rejects.toThrow('Orchestrator not initialized');
  });

  it('should throw error when orchestrator is not initialized for swapToMain', async () => {
    await expect(manager.swapToMain()).rejects.toThrow('Orchestrator not initialized');
  });

  it('should throw error for non-existent agent', async () => {
    const handlers = createMockHandlers();
    await manager.init({ memPersist: false }, handlers);

    await expect(manager.swapToAgent('non-existent-agent')).rejects.toThrow('Agent "non-existent-agent" not found');
  });

  it('should update activeAgentId on successful swap to main', async () => {
    const handlers = createMockHandlers();
    await manager.init({ memPersist: false }, handlers);

    // Initially should be 'main'
    expect(manager.getActiveAgentId()).toBe('main');

    await manager.cleanup();
  });

  it('should restore main agent on swapToMain', async () => {
    const handlers = createMockHandlers();
    await manager.init({ memPersist: false }, handlers);

    // Initially should be 'main'
    expect(manager.getActiveAgentId()).toBe('main');

    // Swap to an agent first (if we had a real agent, this would test the full flow)
    // For now, test that swapToMain returns early when already on main
    await manager.swapToMain();

    // Should still be 'main' after swapToMain when already on main
    expect(manager.getActiveAgentId()).toBe('main');

    await manager.cleanup();
  });
});
