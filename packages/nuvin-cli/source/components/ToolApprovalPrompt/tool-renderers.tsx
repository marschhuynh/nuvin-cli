import type React from 'react';
import { Box, Text } from 'ink';
import { isTodoWriteArgs, parseToolArguments, type ToolCall } from '@nuvin/nuvin-core';
import { useTheme } from '@/contexts/ThemeContext.js';
import { FileEditToolContent } from './ToolContentRenderer/TooFileEdit.js';
import { FileNewToolContent } from './ToolContentRenderer/ToolFileNew.js';
import { SkillToolContent } from './ToolContentRenderer/ToolSkill.js';

export type ToolRendererProps = {
  toolCall: ToolCall;
};

type ParameterConfig = {
  key: string;
  label?: string;
  format?: (value: unknown) => string;
  hide?: boolean;
};

type ToolConfig = {
  parameters?: ParameterConfig[];
  customRenderer?: React.FC<ToolRendererProps>;
  showDefaultParams?: boolean;
};

const formatValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null) {
    return JSON.stringify(value, null, 0);
  }
  return String(value);
};

const TOOL_REGISTRY: Record<string, ToolConfig> = {
  bash_tool: {
    parameters: [
      { key: 'cmd', label: 'Command' },
      { key: 'cwd', label: 'Directory' },
      { key: 'timeoutMs', label: 'Timeout (ms)' },
      { key: 'description', hide: true },
    ],
  },

  file_edit: {
    customRenderer: ({ toolCall }: ToolRendererProps) => <FileEditToolContent call={toolCall} />,
    showDefaultParams: false,
  },

  file_new: {
    customRenderer: ({ toolCall }: ToolRendererProps) => <FileNewToolContent call={toolCall} />,
    showDefaultParams: false,
  },

  skill: {
    customRenderer: ({ toolCall }: ToolRendererProps) => <SkillToolContent call={toolCall} />,
    showDefaultParams: false,
  },

  assign_task: {
    parameters: [
      { key: 'agent', label: 'Agent' },
      { key: 'task', label: 'Task' },
      { key: 'description', hide: true },
    ],
  },

  file_read: {
    parameters: [
      { key: 'path', label: 'Path' },
      { key: 'lineStart', label: 'Start Line' },
      { key: 'lineEnd', label: 'End Line' },
      { key: 'description', hide: true },
    ],
  },

  web_search: {
    parameters: [
      { key: 'query', label: 'Query' },
      { key: 'count', label: 'Results Count' },
      { key: 'domains', label: 'Domains' },
      { key: 'lang', label: 'Language' },
      { key: 'region', label: 'Region' },
      { key: 'recencyDays', label: 'Recency (days)' },
      { key: 'description', hide: true },
    ],
  },

  web_fetch: {
    parameters: [
      { key: 'url', label: 'URL' },
      { key: 'description', hide: true },
    ],
  },

  ls_tool: {
    parameters: [
      { key: 'path', label: 'Path' },
      { key: 'limit', label: 'Entry Limit' },
    ],
  },

  todo_write: {
    showDefaultParams: false,
    customRenderer: ({ toolCall }: ToolRendererProps) => {
      const { theme } = useTheme();
      const args = parseToolArguments(toolCall.function.arguments);
      const todos = isTodoWriteArgs(args)
        ? (args.todos as Array<{ content: string; status: string }> | undefined)
        : undefined;

      if (!todos || !Array.isArray(todos)) {
        return null;
      }

      return (
        <Box flexDirection="column">
          <Box>
            <Text color={theme.toolApproval.statusText}>Todo Items ({todos.length}):</Text>
          </Box>
          {todos.slice(0, 5).map((todo) => (
            <Box key={todo.content} marginLeft={2} flexWrap="wrap">
              <Text dimColor>
                [{todo.status}] {todo.content}
              </Text>
            </Box>
          ))}
          {todos.length > 5 && (
            <Box marginLeft={2}>
              <Text dimColor>... and {todos.length - 5} more</Text>
            </Box>
          )}
        </Box>
      );
    },
  },
};

type DefaultParameterRendererProps = {
  toolCall: ToolCall;
  config: ToolConfig;
};

const DefaultParameterRenderer: React.FC<DefaultParameterRendererProps> = ({ toolCall, config }) => {
  const args = parseToolArguments(toolCall.function.arguments) as Record<string, unknown>;

  const parameters = config.parameters || [];
  const visibleParams = parameters.filter((p) => !p.hide && args[p.key] !== undefined);

  if (visibleParams.length === 0) {
    return null;
  }

  return (
    <Box flexDirection="column" width={'100%'}>
      <Box>
        <Text dimColor>Parameters:</Text>
      </Box>
      {visibleParams.map(({ key, label, format }) => {
        const value = args[key];
        const displayLabel = label || key;
        const displayValue = format ? format(value) : formatValue(value);

        return (
          <Box key={key} marginLeft={2}>
            <Text wrap="wrap">{`${displayLabel}: ${displayValue}`}</Text>
          </Box>
        );
      })}
    </Box>
  );
};

export const ToolRenderer: React.FC<ToolRendererProps> = ({ toolCall }) => {
  const toolName = toolCall.function.name;
  const config = TOOL_REGISTRY[toolName];

  if (!config) {
    const args = parseToolArguments(toolCall.function.arguments) as Record<string, unknown>;

    const allEntries = Object.entries(args).filter(([key]) => key !== 'description');
    return (
      <Box flexDirection="column" width="100%">
        <Box>
          <Text>Parameters:</Text>
        </Box>
        {allEntries.map(([key, value]) => (
          <Box key={key} paddingLeft={2}>
            <Text wrap="wrap" dimColor>{`${key}: ${formatValue(value)}`}</Text>
          </Box>
        ))}
      </Box>
    );
  }

  if (config.customRenderer) {
    const CustomRenderer = config.customRenderer;
    return <CustomRenderer toolCall={toolCall} />;
  }

  return <DefaultParameterRenderer toolCall={toolCall} config={config} />;
};
