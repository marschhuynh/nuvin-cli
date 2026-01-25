import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DelegationServiceFactory, type DelegationServiceConfig } from '../delegation/delegation-service-factory.js';
import { AgentRegistry } from '../agent-registry.js';
import type { AgentCommandRunner } from '../delegation/types.js';
import type { SpecialistAgentConfig, SpecialistAgentResult } from '../agent-types.js';

describe('DelegationServiceFactory', () => {
  let factory: DelegationServiceFactory;
  let mockAgentRegistry: AgentRegistry;
  let mockCommandRunner: AgentCommandRunner;

  beforeEach(() => {
    factory = new DelegationServiceFactory();
    mockAgentRegistry = new AgentRegistry({ filePersistence: null });
    mockCommandRunner = {
      run: vi.fn().mockResolvedValue({
        status: 'success',
        result: 'Task completed',
        metadata: {
          agentId: 'test-agent',
          toolCallsExecuted: 0,
          executionTimeMs: 100,
        },
      } satisfies SpecialistAgentResult),
    };
  });

  describe('create', () => {
    it('should create a delegation service with required dependencies', () => {
      const config: DelegationServiceConfig = {
        agentRegistry: mockAgentRegistry,
        commandRunner: mockCommandRunner,
      };

      const service = factory.create(config);

      expect(service).toBeDefined();
      expect(typeof service.delegate).toBe('function');
      expect(typeof service.setEnabledAgents).toBe('function');
    });

    it('should create service with custom agent list provider', () => {
      const agentListProvider = vi.fn().mockReturnValue([
        { id: 'agent-1', name: 'Agent 1', description: 'Test agent 1' },
        { id: 'agent-2', name: 'Agent 2', description: 'Test agent 2' },
      ]);

      const config: DelegationServiceConfig = {
        agentRegistry: mockAgentRegistry,
        commandRunner: mockCommandRunner,
        agentListProvider,
      };

      const service = factory.create(config);

      expect(service).toBeDefined();
    });

    it('should create service that can delegate tasks', async () => {
      const config: DelegationServiceConfig = {
        agentRegistry: mockAgentRegistry,
        commandRunner: mockCommandRunner,
      };

      const service = factory.create(config);

      await mockAgentRegistry.register({
        name: 'test-agent',
        description: 'A test agent',
        instructions: 'Test prompt',
      });

      await mockAgentRegistry.waitForLoad();

      const result = await service.delegate({
        agent: 'test-agent',
        task: 'Test task',
      });

      expect(result.success).toBe(true);
      expect(mockCommandRunner.run).toHaveBeenCalled();
    });

    it('should create service that handles missing agents', async () => {
      const config: DelegationServiceConfig = {
        agentRegistry: mockAgentRegistry,
        commandRunner: mockCommandRunner,
      };

      const service = factory.create(config);

      const result = await service.delegate({
        agent: 'non-existent-agent',
        task: 'Test task',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should create service with enabled agents configuration', async () => {
      const config: DelegationServiceConfig = {
        agentRegistry: mockAgentRegistry,
        commandRunner: mockCommandRunner,
      };

      const service = factory.create(config);

      await mockAgentRegistry.register({
        id: 'test-agent',
        name: 'test-agent',
        description: 'A test agent',
        instructions: 'Test prompt',
      });

      await mockAgentRegistry.waitForLoad();

      service.setEnabledAgents({ 'test-agent': false });

      const result = await service.delegate({
        agent: 'test-agent',
        task: 'Test task',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('disabled');
    });

    it('should create independent service instances', () => {
      const config1: DelegationServiceConfig = {
        agentRegistry: mockAgentRegistry,
        commandRunner: mockCommandRunner,
      };

      const config2: DelegationServiceConfig = {
        agentRegistry: new AgentRegistry({ filePersistence: null }),
        commandRunner: mockCommandRunner,
      };

      const service1 = factory.create(config1);
      const service2 = factory.create(config2);

      expect(service1).not.toBe(service2);
    });
  });
});
