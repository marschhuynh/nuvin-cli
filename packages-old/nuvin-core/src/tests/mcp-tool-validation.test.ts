import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MCPToolPort } from '../mcp/mcp-tools.js';
import type { ToolExecutionResult } from '../ports.js';

describe('MCP Tool Schema Validation', () => {
  let mockCallTool: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCallTool = vi.fn();
  });

  it('should validate params against JSON Schema before calling MCP', async () => {
    const mockClient = {
      isConnected: vi.fn(() => true),
      connect: vi.fn().mockResolvedValue(undefined),
      getTools: vi.fn(() => [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              count: { type: 'number', minimum: 1 },
            },
            required: ['query'],
          },
        },
      ]),
      callTool: mockCallTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }],
      } as unknown),
    };

    const port = new MCPToolPort(mockClient as unknown);

    await port.init();

    const toolCalls = [
      {
        id: 'call-1',
        name: 'mcp_test_tool',
        parameters: { query: 'test' },
      },
    ];

    await port.executeToolCalls(toolCalls, {}, 3);

    expect(mockCallTool).toHaveBeenCalledTimes(1);
    expect(mockCallTool).toHaveBeenCalledWith({
      name: 'test_tool',
      arguments: { query: 'test' },
    });
  });

  it('should reject invalid params with ValidationFailed error', async () => {
    const mockClient = {
      isConnected: vi.fn(() => true),
      connect: vi.fn().mockResolvedValue(undefined),
      getTools: vi.fn(() => [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: {
            type: 'object',
            properties: {
              query: { type: 'string' },
              count: { type: 'number', minimum: 1 },
            },
            required: ['query'],
          },
        },
      ]),
      callTool: mockCallTool,
    };

    const port = new MCPToolPort(mockClient as unknown);

    await port.init();

    const toolCalls = [
      {
        id: 'call-1',
        name: 'mcp_test_tool',
        parameters: { count: 5 }, // Missing required 'query'
      },
    ];

    const results = (await port.executeToolCalls(toolCalls, {}, 3)) as ToolExecutionResult[];

    expect(results[0].status).toBe('error');
    expect(results[0].result).toContain('Parameter validation failed');
    expect(results[0].metadata?.errorReason).toBe('validation_failed');
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('should reject invalid param types with detailed errors', async () => {
    const mockClient = {
      isConnected: vi.fn(() => true),
      connect: vi.fn().mockResolvedValue(undefined),
      getTools: vi.fn(() => [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: {
            type: 'object',
            properties: {
              count: { type: 'number', minimum: 1 },
            },
            required: ['count'],
          },
        },
      ]),
      callTool: mockCallTool,
    };

    const port = new MCPToolPort(mockClient as unknown);

    await port.init();

    const toolCalls = [
      {
        id: 'call-1',
        name: 'mcp_test_tool',
        parameters: { count: -1 }, // Invalid: minimum is 1
      },
    ];

    const results = (await port.executeToolCalls(toolCalls, {}, 3)) as ToolExecutionResult[];

    expect(results[0].status).toBe('error');
    expect(results[0].result).toContain('Parameter validation failed');
    expect(results[0].result).toMatch(/count/);
    expect((results[0].metadata as Record<string, unknown> | undefined)?.errorReason).toBe('validation_failed');
    expect(mockClient.callTool).not.toHaveBeenCalled();
  });

  it('should reject invalid param types with detailed errors', async () => {
    const mockClient = {
      isConnected: vi.fn(() => true),
      connect: vi.fn().mockResolvedValue(undefined),
      getTools: vi.fn(() => [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: {
            type: 'object',
            properties: {
              count: { type: 'number', minimum: 1 },
            },
            required: ['count'],
          },
        },
      ]),
      callTool: mockCallTool,
    };

    const port = new MCPToolPort(mockClient as unknown);

    await port.init();

    const toolCalls = [
      {
        id: 'call-1',
        name: 'mcp_test_tool',
        parameters: { count: -1 }, // Invalid: minimum is 1
      },
    ];

    const allResults = await port.executeToolCalls(toolCalls, {}, 3);
    const results = allResults as ToolExecutionResult[];

    expect(results[0].status).toBe('error');
    expect(results[0].result).toContain('Parameter validation failed');
    expect(results[0].result).toMatch(/expected number to be >=1/);
    expect((results[0].metadata as Record<string, unknown> | undefined)?.errorReason).toBe('validation_failed');
    expect(mockClient.callTool).not.toHaveBeenCalled();
  });

  it('should handle JSON Schema conversion errors gracefully', async () => {
    const mockClient = {
      isConnected: vi.fn(() => true),
      connect: vi.fn().mockResolvedValue(undefined),
      getTools: vi.fn(() => [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: { type: 'invalid_schema' }, // Invalid schema
        },
      ]),
      callTool: mockCallTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }],
      } as unknown),
    };

    const port = new MCPToolPort(mockClient as unknown);

    await port.init();

    const toolCalls = [
      {
        id: 'call-1',
        name: 'mcp_test_tool',
        parameters: { query: 'test' },
      },
    ];

    const results = (await port.executeToolCalls(toolCalls, {}, 3)) as ToolExecutionResult[];

    // Should skip validation and proceed with the call when schema conversion fails
    expect(mockCallTool).toHaveBeenCalledTimes(1);
  });

  it('should validate params when schema has no properties', async () => {
    const mockClient = {
      isConnected: vi.fn(() => true),
      connect: vi.fn().mockResolvedValue(undefined),
      getTools: vi.fn(() => [
        {
          name: 'test_tool',
          description: 'Test tool',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
      ]),
      callTool: mockCallTool.mockResolvedValue({
        content: [{ type: 'text', text: 'Success' }],
      } as unknown),
    };

    const port = new MCPToolPort(mockClient as unknown);

    await port.init();

    const toolCalls = [
      {
        id: 'call-1',
        name: 'mcp_test_tool',
        parameters: {},
      },
    ];

    const results = (await port.executeToolCalls(toolCalls, {}, 3)) as ToolExecutionResult[];

    expect(mockCallTool).toHaveBeenCalledTimes(1);
  });
});
