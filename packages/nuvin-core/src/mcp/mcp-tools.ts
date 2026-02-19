import type {
  TextContentPart,
  ImageContentPart,
  ToolDefinition,
  ToolExecutionResult,
  ToolInvocation,
  ToolPort,
} from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { CoreMCPClient, MCPToolSchema } from './mcp-client.js';
import { jsonSchemaToZod } from 'json-zodify';
import type { z } from 'zod';

type NameMap = Map<string, string>;

interface MCPToolCallResponse {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
}

function sanitizeName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_');
}

function toExposedName(original: string, prefix = 'mcp_'): string {
  const s = sanitizeName(original);
  return `${prefix}${s}`;
}

interface MCPContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

type FlatResult =
  | { type: 'text'; value: string }
  | { type: 'json'; value: Record<string, unknown> | unknown[] }
  | { type: 'mixed'; parts: Array<TextContentPart | ImageContentPart> };

export function flattenMcpContent(content: MCPContent[] | undefined): FlatResult {
  if (!content || content.length === 0) return { type: 'text', value: '' };

  const hasImages = content.some((c) => c.type === 'image' && c.data && c.mimeType);

  if (hasImages) {
    const parts: Array<TextContentPart | ImageContentPart> = [];
    for (const c of content) {
      if (c.type === 'text' && typeof c.text === 'string') {
        parts.push({ type: 'text', text: c.text });
      } else if (c.type === 'image' && c.data && c.mimeType) {
        parts.push({ type: 'image', mimeType: c.mimeType, data: c.data });
      }
    }
    return { type: 'mixed', parts };
  }

  const allText = content.every((c) => c && c.type === 'text' && typeof c.text === 'string');
  if (allText) return { type: 'text', value: content.map((c) => c.text).join('\n') };
  return { type: 'json', value: content };
}

export class MCPToolPort implements ToolPort {
  private map: NameMap = new Map();
  private toolSchemas: Map<string, MCPToolSchema> = new Map();
  private zodSchemas: Map<string, unknown> = new Map();
  private prefix: string;

  constructor(
    private client: CoreMCPClient,
    opts?: { prefix?: string },
  ) {
    this.prefix = opts?.prefix ?? 'mcp_';
  }

  async init(): Promise<void> {
    if (!this.client.isConnected()) await this.client.connect();
    const tools = this.client.getTools();
    this.map.clear();
    this.toolSchemas.clear();
    this.zodSchemas.clear();
    for (const t of tools) {
      const exposed = toExposedName(t.name, this.prefix);
      this.map.set(exposed, t.name);
      this.toolSchemas.set(t.name, t);
      if (t.inputSchema) {
        try {
          const zodSchema = jsonSchemaToZod(t.inputSchema);
          this.zodSchemas.set(exposed, zodSchema);
        } catch (e) {
          console.warn(`[MCPToolPort] Failed to convert schema for ${t.name}:`, e);
        }
      }
    }
  }

  getExposedToolNames(): string[] {
    return Array.from(this.map.keys());
  }

  getToolDefinitions(enabledTools: string[]): ToolDefinition[] {
    const wanted = new Set(enabledTools);
    const defs: ToolDefinition[] = [];
    for (const [exposed, original] of this.map.entries()) {
      if (!wanted.has(exposed)) continue;
      const schema = this.toolSchemas.get(original);
      if (!schema) continue;
      defs.push({
        type: 'function',
        function: {
          name: exposed,
          description: `MCP: ${schema.description || original}`,
          parameters: schema.inputSchema ?? { type: 'object', properties: {}, required: [] },
        },
      });
    }
    return defs;
  }

  async executeToolCalls(
    calls: ToolInvocation[],
    _context?: Record<string, unknown>,
    maxConcurrent = 3,
    signal?: AbortSignal,
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];
    const batches: ToolInvocation[][] = [];
    for (let i = 0; i < calls.length; i += maxConcurrent) batches.push(calls.slice(i, i + maxConcurrent));

    for (const batch of batches) {
      if (signal?.aborted) {
        for (const c of batch) {
          results.push({
            id: c.id,
            name: c.name,
            status: 'error',
            type: 'text',
            result: 'Tool execution aborted by user',
          });
        }
        continue;
      }

      const out = await Promise.all(
        batch.map(async (c): Promise<ToolExecutionResult> => {
          if (signal?.aborted) {
            return {
              id: c.id,
              name: c.name,
              status: 'error',
              type: 'text',
              result: 'Tool execution aborted by user',
            };
          }

          if (c.editInstruction) {
            const editResult = `${c.editInstruction}
<system-reminder>
This is not a result from the tool call. The user wants something else. Please follow the user's instruction.
DO NOT mention this explicitly to the user.
</system-reminder>`;
            return {
              id: c.id,
              name: c.name,
              status: 'error',
              type: 'text',
              result: editResult,
              metadata: { errorReason: ErrorReason.Edited, editInstruction: c.editInstruction },
              durationMs: 0,
            };
          }

          const original = this.map.get(c.name);
          if (!original) {
            return { id: c.id, name: c.name, status: 'error', type: 'text', result: `Unknown MCP tool: ${c.name}` };
          }

          const zodSchema = this.zodSchemas.get(c.name);
          if (zodSchema) {
            const schema = zodSchema as z.ZodType<Record<string, unknown>>;
            const validation = schema.safeParse(c.parameters || {});
            if (!validation.success) {
              const errors = validation.error.issues.map((err) => `${err.path.join('.')}: ${err.message}`);
              return {
                id: c.id,
                name: c.name,
                status: 'error',
                type: 'text',
                result: `Parameter validation failed: ${errors.join('; ')}`,
                metadata: { errorReason: ErrorReason.ValidationFailed },
                durationMs: 0,
              };
            }
          }

          try {
            const res = await this.client.callTool({ name: original, arguments: c.parameters || {} });
            const flat = flattenMcpContent((res as MCPToolCallResponse).content);
            if (flat.type === 'text') {
              return { id: c.id, name: c.name, status: 'success' as const, type: 'text' as const, result: flat.value };
            } else if (flat.type === 'mixed') {
              return { id: c.id, name: c.name, status: 'success' as const, type: 'mixed' as const, result: flat.parts };
            } else {
              return { id: c.id, name: c.name, status: 'success' as const, type: 'json' as const, result: flat.value };
            }
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            return { id: c.id, name: c.name, status: 'error', type: 'text', result: message };
          }
        }),
      );
      results.push(...out);
    }
    return results;
  }
}
