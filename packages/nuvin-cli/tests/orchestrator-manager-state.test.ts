import { describe, it, expect, beforeEach, vi } from 'vitest';

// Use vi.hoisted to create mock before module is loaded
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
      skills: {},
    })),
    get: vi.fn(() => undefined),
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

// Import after mocking
import { OrchestratorManager } from '../source/services/OrchestratorManager.js';

describe('OrchestratorManager State', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize activeAgentId to "main"', () => {
    const manager = new OrchestratorManager();
    // Access the private property via type casting
    expect((manager as unknown as { activeAgentId: string }).activeAgentId).toBe('main');
  });

  it('should initialize previousOrchestrator to null', () => {
    const manager = new OrchestratorManager();
    // Access the private property via type casting
    expect((manager as unknown as { previousOrchestrator: unknown }).previousOrchestrator).toBeNull();
  });

  it('should return "main" by default from getActiveAgentId()', () => {
    const manager = new OrchestratorManager();
    expect(manager.getActiveAgentId()).toBe('main');
  });
});
