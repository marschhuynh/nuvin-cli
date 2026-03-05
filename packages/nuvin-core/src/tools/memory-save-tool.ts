export const memorySaveToolDefinition = {
  name: 'memory_save',
  description:
    'Save important information to long-term memory so it persists across sessions. ' +
    'Use this to remember user preferences, project facts, coding conventions, or lessons learned.',
  parameters: {
    type: 'object' as const,
    properties: {
      content: {
        type: 'string',
        description: 'The information to remember. Should be a clear, concise statement.',
      },
      topic: {
        type: 'string',
        description:
          'Topic key for this memory (e.g. "typescript-formatting"). ' +
          'If omitted, the system will infer one deterministically from key/content.',
      },
      key: {
        type: 'string',
        description: 'Optional stable semantic key (e.g. "style.quotes", "tooling.package-manager").',
      },
      type: {
        type: 'string',
        enum: ['semantic', 'episodic', 'procedural'],
        description: 'Memory type: "semantic" for facts, "episodic" for experiences, "procedural" for rules.',
      },
      scope: {
        type: 'string',
        enum: ['global', 'project'],
        description: 'Scope: "global" for cross-project, "project" for project-specific.',
      },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional categorization tags.',
      },
      keywords: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional keywords for retrieval ranking.',
      },
      title: {
        type: 'string',
        description: 'Optional human-readable topic title.',
      },
      confidence: {
        type: 'number',
        description: 'Optional confidence score in [0, 1]. Higher confidence can supersede lower-confidence memories.',
      },
      evidence: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional supporting evidence snippets for auditability.',
      },
      updateMode: {
        type: 'string',
        enum: ['merge', 'replace'],
        description: 'How to update existing topic memory: merge (default) or replace.',
      },
    },
    required: ['content', 'type', 'scope'],
  },
};

export interface MemorySaveToolInput {
  content: string;
  topic?: string;
  key?: string;
  title?: string;
  type: 'semantic' | 'episodic' | 'procedural';
  scope: 'global' | 'project';
  confidence?: number;
  evidence?: string[];
  tags?: string[];
  keywords?: string[];
  updateMode?: 'merge' | 'replace';
}
