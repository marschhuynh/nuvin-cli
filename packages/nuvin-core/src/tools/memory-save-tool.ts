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
    },
    required: ['content', 'type', 'scope'],
  },
};

export interface MemorySaveToolInput {
  content: string;
  type: 'semantic' | 'episodic' | 'procedural';
  scope: 'global' | 'project';
  tags?: string[];
}
