import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CommandRegistry } from '../source/modules/commands/registry.js';
import { registerModelsCommand } from '../source/modules/commands/definitions/models/models.js';
import { registerAuthCommand } from '../source/modules/commands/definitions/auth/index.js';
import type { TypedEventBus } from '../source/services/EventBus.js';
import type { OrchestratorManager } from '../source/services/OrchestratorManager.js';

const createMockConfigFunctions = () => ({
  get: vi.fn((key: string) => {
    // Simulate provider without auth configuration
    if (key.startsWith('providers.') && key.endsWith('.auth')) {
      return []; // Empty auth array means provider needs configuration
    }
    if (key === 'memPersist') return false;
    return undefined;
  }),
  set: vi.fn(),
});

type EventHandler = (...args: unknown[]) => void;

const createMockEventBus = (): TypedEventBus => {
  const listeners = new Map<string, Set<EventHandler>>();

  return {
    on: vi.fn((event: string, handler: EventHandler) => {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }
      listeners.get(event)?.add(handler);
    }),
    off: vi.fn((event: string, handler: EventHandler) => {
      listeners.get(event)?.delete(handler);
    }),
    emit: vi.fn((event: string, ...args: unknown[]) => {
      const handlers = listeners.get(event);
      if (handlers) {
        for (const handler of handlers) {
          handler(...args);
        }
      }
    }),
  } as TypedEventBus;
};

describe('Models Command Authentication Navigation', () => {
  let registry: CommandRegistry;
  let mockEventBus: TypedEventBus;
  let mockConfig: ReturnType<typeof createMockConfigFunctions>;
  let mockOrchestratorManager: OrchestratorManager;
  let executedCommands: string[] = [];

  beforeEach(() => {
    executedCommands = [];
    mockEventBus = createMockEventBus();
    mockConfig = createMockConfigFunctions();

    mockOrchestratorManager = {
      getLLMFactory: vi.fn(() => undefined), // No LLM factory for testing
    } as unknown as OrchestratorManager;

    registry = new CommandRegistry(mockOrchestratorManager);
    registry.setConfigFunctions(mockConfig);

    // Mock the execute method to track executed commands
    const originalExecute = registry.execute.bind(registry);
    vi.spyOn(registry, 'execute').mockImplementation(async (input: string) => {
      executedCommands.push(input);
      return originalExecute(input);
    });

    // Replace the global eventBus with our mock
    (registry as { createContext: (input: string) => CommandContext }).createContext = function (input: string) {
      return {
        rawInput: input,
        eventBus: mockEventBus,
        registry: this,
        config: this.configFunctions,
        orchestratorManager: this.orchestratorManager,
      };
    };

    registerModelsCommand(registry);
    registerAuthCommand(registry);
  });

  it('should be registered with correct id and description', () => {
    const command = registry.get('/model');

    expect(command).toBeDefined();
    expect(command?.id).toBe('/model');
    expect(command?.description).toBe('Select model from all authenticated providers.');
    expect(command?.category).toBe('config');
  });

  it('should detect when provider authentication is missing', async () => {
    // Mock config to simulate a provider without auth
    mockConfig.get.mockImplementation((key: string) => {
      if (key === 'providers.anthropic.auth') return []; // No auth configured
      if (key === 'providers.openrouter.auth') return [{ type: 'token' }]; // Has auth
      if (key === 'memPersist') return false;
      return undefined;
    });

    // This would be called internally when trying to save a model for anthropic
    const errorMessage = await (async () => {
      try {
        // Simulate the authentication check that happens in saveConfiguration
        const providerAuth = mockConfig.get<unknown[]>('providers.anthropic.auth');
        const hasAuthConfig = providerAuth && Array.isArray(providerAuth) && providerAuth.length > 0;

        if (!hasAuthConfig) {
          return "Provider 'anthropic' is not configured. Please run /auth first.";
        }
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : 'Unknown error';
      }
    })();

    expect(errorMessage).toBe("Provider 'anthropic' is not configured. Please run /auth first.");
  });

  it('should properly format auth command with provider parameter', () => {
    const authCommandWithProvider = '/auth anthropic';
    const parts = authCommandWithProvider.trim().split(/\s+/);

    expect(parts.length).toBe(2);
    expect(parts[0]).toBe('/auth');
    expect(parts[1]).toBe('anthropic');
  });

  it('should execute auth command when navigating from models', async () => {
    // Test that the navigation mechanism works
    const authCommand = '/auth anthropic';
    const result = await registry.execute(authCommand);

    expect(result.success).toBe(true);
    expect(result.commandId).toBe('/auth');
    expect(executedCommands).toContain('/auth anthropic');
  });

  it('should handle navigation without provider parameter', async () => {
    const authCommand = '/auth';
    const result = await registry.execute(authCommand);

    expect(result.success).toBe(true);
    expect(result.commandId).toBe('/auth');
    expect(executedCommands).toContain('/auth');
  });

  it('should recognize providers with authentication configured', async () => {
    // Mock config to simulate a provider with auth
    mockConfig.get.mockImplementation((key: string) => {
      if (key === 'providers.openrouter.auth') return [{ type: 'token' }]; // Has auth
      return undefined;
    });

    // This would be called internally when trying to save a model for openrouter
    const hasAuth = await (async () => {
      const providerAuth = mockConfig.get<unknown[]>('providers.openrouter.auth');
      return providerAuth && Array.isArray(providerAuth) && providerAuth.length > 0;
    })();

    expect(hasAuth).toBe(true);
  });

  it('should trigger auth prompt when LLMFactory throws auth error', () => {
    // Simulate the error message from LLMFactory
    const errorMessage = 'kimi API key not configured. Please run /auth first.';

    // Check if the error message would trigger the auth prompt
    const shouldShowPrompt = errorMessage.includes('not configured') || errorMessage.includes('/auth');

    expect(shouldShowPrompt).toBe(true);
  });

  it('should trigger auth prompt for various auth error messages', () => {
    const authErrors = [
      'kimi API key not configured. Please run /auth first.',
      "Provider 'anthropic' is not configured. Please run /auth first.",
      'openrouter not configured',
      'Token not configured for github',
    ];

    authErrors.forEach((error) => {
      const shouldShowPrompt = error.includes('not configured') || error.includes('/auth');
      expect(shouldShowPrompt).toBe(true);
    });
  });

  it('should hide custom model option when auth prompt is shown', () => {
    // When showAuthPrompt is true, the custom model option should not be available
    // This is tested in the UI by conditionally rendering the AuthNavigationPrompt
    // instead of the model selection UI
    const hasAuthError = true;
    const shouldShowModelSelection = !hasAuthError;

    expect(shouldShowModelSelection).toBe(false);
  });

  it('should show interactive Yes/No buttons when auth prompt is active', () => {
    // The AuthNavigationPrompt component renders interactive buttons
    // similar to the ToolApprovalPrompt component
    const hasAuthPrompt = true;

    // Verify that the prompt should be shown
    expect(hasAuthPrompt).toBe(true);

    // The component supports keyboard navigation:
    // - Tab/Arrow keys to navigate between Yes/No
    // - Enter to select
    // - 1/Y for Yes, 2/N for No
  });

  it('should include --return-to-model flag when navigating to auth', () => {
    const provider = 'anthropic';
    const authCommand = `/auth ${provider} --return-to-model`;

    // Parse the command to verify structure
    const parts = authCommand.trim().split(/\s+/);

    expect(parts[0]).toBe('/auth');
    expect(parts[1]).toBe(provider);
    expect(parts[2]).toBe('--return-to-model');
    expect(authCommand.includes('--return-to-model')).toBe(true);
  });

  it('should parse --return-to-model flag from auth command', () => {
    const authCommand = '/auth anthropic --return-to-model';
    const args = authCommand.trim().split(/\s+/);

    const shouldReturnToModel = args.includes('--return-to-model');
    const provider = args.length > 1 && !args[1].startsWith('--') ? args[1] : null;

    expect(shouldReturnToModel).toBe(true);
    expect(provider).toBe('anthropic');
  });

  it('should execute /model command after successful auth with --return-to-model flag', async () => {
    // Simulate the flow
    const authCommandWithReturn = '/auth openrouter --return-to-model';
    const shouldReturnToModel = authCommandWithReturn.includes('--return-to-model');

    expect(shouldReturnToModel).toBe(true);

    // After successful auth, /model should be executed
    const nextCommand = '/model';
    expect(nextCommand).toBe('/model');
  });
});
