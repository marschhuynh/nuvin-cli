export const memoryQueryToolDefinition = {
  name: 'memory_query',
  description:
    'Query long-term memory for relevant facts, preferences, and conventions before making decisions. ' +
    'Use this when you need precise recall from prior sessions.',
  parameters: {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Natural language query describing what memory to retrieve.',
      },
      key: {
        type: 'string',
        description: 'Optional stable semantic key to target (e.g. "style.quotes").',
      },
      scope: {
        type: 'string',
        enum: ['global', 'project', 'both'],
        description: 'Memory scope to search. Defaults to "both".',
      },
      topK: {
        type: 'number',
        description: 'Maximum number of hits to return. Defaults to 12.',
      },
      minScore: {
        type: 'number',
        description: 'Optional minimum relevance score threshold.',
      },
    },
    required: ['query'],
  },
};

export interface MemoryQueryToolInput {
  query: string;
  key?: string;
  scope?: 'global' | 'project' | 'both';
  topK?: number;
  minScore?: number;
}

export interface MemoryQueryToolHit extends Record<string, unknown> {
  id: string;
  statementId: string;
  key?: string;
  topic: string;
  scope: 'global' | 'project';
  type: 'semantic' | 'episodic' | 'procedural';
  content: string;
  score: number;
  confidence?: number;
  updatedAt: string;
}

export interface MemoryQueryToolResult extends Record<string, unknown> {
  query: string;
  key?: string;
  scope: 'global' | 'project' | 'both';
  totalHits: number;
  hits: MemoryQueryToolHit[];
}
