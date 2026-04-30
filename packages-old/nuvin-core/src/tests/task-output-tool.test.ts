import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskOutputTool } from '../tools/TaskOutputTool.js';
import type { DelegationService } from '../delegation/types.js';

describe('TaskOutputTool', () => {
  let tool: TaskOutputTool;
  let mockDelegationService: Partial<DelegationService>;

  beforeEach(() => {
    mockDelegationService = {
      getBackgroundResult: vi.fn(),
      isBackgroundAgentRunning: vi.fn(),
      setEnabledAgents: vi.fn(),
      listEnabledAgents: vi.fn().mockReturnValue([]),
      delegate: vi.fn(),
    };
    tool = new TaskOutputTool(mockDelegationService as DelegationService);
  });

  describe('non-blocking mode', () => {
    it('should return running status for active agent', async () => {
      mockDelegationService.getBackgroundResult = vi.fn().mockResolvedValue(null);
      mockDelegationService.isBackgroundAgentRunning = vi.fn().mockReturnValue(true);

      const result = await tool.execute({ session_id: 'test-123' });

      expect(result.status).toBe('success');
      expect(result.metadata?.state).toBe('running');
    });

    it('should return completed result', async () => {
      mockDelegationService.getBackgroundResult = vi.fn().mockResolvedValue({
        success: true,
        summary: 'Analysis complete: found 5 issues',
        metadata: { metrics: { tokensUsed: 1000 } },
      });

      const result = await tool.execute({ session_id: 'test-123' });

      expect(result.status).toBe('success');
      expect(result.type).toBe('text');
      if (result.status === 'success' && result.type === 'text') {
        expect(result.result).toContain('Analysis complete');
      }
      expect(result.metadata?.state).toBe('completed');
    });

    it('should return not_found for unknown session', async () => {
      mockDelegationService.getBackgroundResult = vi.fn().mockResolvedValue(null);
      mockDelegationService.isBackgroundAgentRunning = vi.fn().mockReturnValue(false);

      const result = await tool.execute({ session_id: 'unknown' });

      expect(result.status).toBe('error');
      expect(result.metadata?.state).toBe('not_found');
    });

    it('should return failed status on error', async () => {
      mockDelegationService.getBackgroundResult = vi.fn().mockResolvedValue({
        success: false,
        error: 'Agent crashed unexpectedly',
      });

      const result = await tool.execute({ session_id: 'test-123' });

      expect(result.status).toBe('error');
      expect(result.metadata?.state).toBe('failed');
    });
  });

  describe('blocking mode', () => {
    it('should wait for completion', async () => {
      mockDelegationService.isBackgroundAgentRunning = vi.fn().mockReturnValue(true);
      mockDelegationService.getBackgroundResult = vi.fn().mockResolvedValue({
        success: true,
        summary: 'Done!',
      });

      const result = await tool.execute({
        session_id: 'test-123',
        blocking: true,
      });

      expect(result.status).toBe('success');
      expect(mockDelegationService.getBackgroundResult).toHaveBeenCalledWith('test-123', true);
    });

    it('should respect timeout', async () => {
      mockDelegationService.isBackgroundAgentRunning = vi.fn().mockReturnValue(true);
      mockDelegationService.getBackgroundResult = vi
        .fn()
        .mockImplementation(
          () => new Promise((resolve) => setTimeout(() => resolve({ success: true }), 10000)),
        );

      const result = await tool.execute({
        session_id: 'test-123',
        blocking: true,
        timeout_ms: 100,
      });

      expect(result.status).toBe('error');
      expect(result.result).toContain('Timeout');
    }, 5000);

    it('should return not_found if session does not exist', async () => {
      mockDelegationService.isBackgroundAgentRunning = vi.fn().mockReturnValue(false);
      mockDelegationService.getBackgroundResult = vi.fn().mockResolvedValue(null);

      const result = await tool.execute({
        session_id: 'non-existent',
        blocking: true,
      });

      expect(result.status).toBe('error');
      expect(result.metadata?.state).toBe('not_found');
    });
  });

  describe('validation', () => {
    it('should require session_id', async () => {
      const result = await tool.execute({ session_id: '' });

      expect(result.status).toBe('error');
      expect(result.result).toContain('session_id');
    });

    it('should handle unsupported delegation service', async () => {
      const minimalService: Partial<DelegationService> = {
        setEnabledAgents: vi.fn(),
        listEnabledAgents: vi.fn().mockReturnValue([]),
        delegate: vi.fn(),
      };
      const minimalTool = new TaskOutputTool(minimalService as DelegationService);

      const result = await minimalTool.execute({ session_id: 'test' });

      expect(result.status).toBe('error');
      expect(result.result).toContain('not supported');
    });
  });

  describe('definition', () => {
    it('should return correct tool definition', () => {
      const def = tool.definition();

      expect(def.name).toBe('task_output');
      expect(def.description).toContain('background agent');
      expect(def.parameters.properties).toHaveProperty('session_id');
      expect(def.parameters.properties).toHaveProperty('blocking');
      expect(def.parameters.properties).toHaveProperty('timeout_ms');
    });
  });
});
