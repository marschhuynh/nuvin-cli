import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AssignTool } from '../tools/AssignTool.js';
import type { DelegationService } from '../delegation/types.js';
import { ErrorReason } from '../ports.js';

describe('AssignTool - Error Reasons', () => {
  let assignTool: AssignTool;
  let mockDelegationService: DelegationService;

  beforeEach(() => {
    mockDelegationService = {
      delegate: vi.fn(),
      setEnabledAgents: vi.fn(),
      listEnabledAgents: vi.fn().mockReturnValue([
        {
          name: 'test-agent',
          description: 'Test agent',
          allowed_tools: [],
        },
      ]),
    } as unknown as DelegationService;

    assignTool = new AssignTool(mockDelegationService);
  });

  it('should return ErrorReason.Aborted when sub-agent execution is aborted', async () => {
    vi.mocked(mockDelegationService.delegate).mockResolvedValue({
      success: false,
      error: 'Sub-agent execution aborted by user',
    });

    const result = await assignTool.execute({
      agent: 'test-agent',
      task: 'Do something',
      description: 'Test task',
    });

    expect(result.status).toBe('error');
    expect(result.metadata?.errorReason).toBe(ErrorReason.Aborted);
    expect(result.result).toContain('aborted');
  });

  it('should return ErrorReason.Timeout when sub-agent execution times out', async () => {
    vi.mocked(mockDelegationService.delegate).mockResolvedValue({
      success: false,
      error: 'Task execution timeout after 50000ms',
    });

    const result = await assignTool.execute({
      agent: 'test-agent',
      task: 'Do something',
      description: 'Test task',
    });

    expect(result.status).toBe('error');
    expect(result.metadata?.errorReason).toBe(ErrorReason.Timeout);
    expect(result.result).toContain('timeout');
  });

  it('should return ErrorReason.NotFound when agent is not found', async () => {
    vi.mocked(mockDelegationService.delegate).mockResolvedValue({
      success: false,
      error: 'Agent "unknown-agent" not found in registry',
    });

    const result = await assignTool.execute({
      agent: 'unknown-agent',
      task: 'Do something',
      description: 'Test task',
    });

    expect(result.status).toBe('error');
    expect(result.metadata?.errorReason).toBe(ErrorReason.NotFound);
    expect(result.metadata?.agentNotFound).toBe(true);
    expect(result.result).toContain('not found');
  });

  it('should return ErrorReason.PermissionDenied when policy denies execution', async () => {
    vi.mocked(mockDelegationService.delegate).mockResolvedValue({
      success: false,
      error: 'Delegation denied by policy',
    });

    const result = await assignTool.execute({
      agent: 'test-agent',
      task: 'Do something',
      description: 'Test task',
    });

    expect(result.status).toBe('error');
    expect(result.metadata?.errorReason).toBe(ErrorReason.PermissionDenied);
    expect(result.metadata?.policyDenied).toBe(true);
    expect(result.result).toContain('denied');
  });

  it('should return ErrorReason.Unknown for other errors', async () => {
    vi.mocked(mockDelegationService.delegate).mockResolvedValue({
      success: false,
      error: 'Some unexpected error occurred',
    });

    const result = await assignTool.execute({
      agent: 'test-agent',
      task: 'Do something',
      description: 'Test task',
    });

    expect(result.status).toBe('error');
    expect(result.metadata?.errorReason).toBe(ErrorReason.Unknown);
    expect(result.result).toBe('Some unexpected error occurred');
  });

  it('should return ErrorReason.InvalidInput when agent parameter is missing', async () => {
    const result = await assignTool.execute({
      agent: '',
      task: 'Do something',
      description: 'Test task',
    });

    expect(result.status).toBe('error');
    expect(result.metadata?.errorReason).toBe(ErrorReason.InvalidInput);
    expect(result.result).toContain('agent');
  });

  it('should return ErrorReason.InvalidInput when task parameter is missing', async () => {
    const result = await assignTool.execute({
      agent: 'test-agent',
      task: '',
      description: 'Test task',
    });

    expect(result.status).toBe('error');
    expect(result.metadata?.errorReason).toBe(ErrorReason.InvalidInput);
    expect(result.result).toContain('task');
  });
});
