import React, {useEffect, useRef, useState, useMemo} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {prompt} from './prompt.js';

// Core imports from the monorepo
import {AgentOrchestrator} from '../../nuvin-core/orchestrator.js';
import {SimpleContextBuilder} from '../../nuvin-core/context.js';
import {InMemoryMemory, PersistedMemory, JsonFileMemoryPersistence} from '../../nuvin-core/persistent/index.js';
import type {Message} from '../../nuvin-core/ports.js';
import {SimpleId} from '../../nuvin-core/id.js';
import {SystemClock} from '../../nuvin-core/clock.js';
import {SimpleCost} from '../../nuvin-core/cost.js';
import {NoopReminders} from '../../nuvin-core/reminders.js';
import {ToolRegistry} from '../../nuvin-core/tools.js';
import {EchoLLM, GithubLLM, OpenRouterLLM} from '../../nuvin-core/llm-providers/index.js';
import {MCPToolPort, CoreMCPClient} from '../../nuvin-core/mcp/index.js';
import {CompositeToolPort} from '../../nuvin-core/tools-composite.js';
import {loadMCPConfig} from '../../nuvin-core/config.js';
import {PersistingConsoleEventPort} from '../../nuvin-core/events.js';
import type {TodoItem as StoreTodo} from '../../nuvin-core/todo-store.js';
import type {AgentEvent} from '../../nuvin-core/ports.js';
import {AgentEventTypes } from '../../nuvin-core/ports.js';


type Props = {
  useOpenRouter?: boolean;
  useGithub?: boolean;
  memPersist?: boolean;
  mcpConfigPath?: string;
};

type MessageLine = {
  id: string;
  type: 'user' | 'assistant' | 'tool' | 'tool_result' | 'system' | 'error' | 'info';
  content: string;
  metadata?: {
    timestamp?: string;
    toolName?: string;
    status?: 'success' | 'error';
    duration?: number;
    toolCallCount?: number;
    toolCalls?: ToolCall[];
    toolResult?: any;
  };
  color?: string;
};

class UIEventPort extends PersistingConsoleEventPort {
  private toolCallCount = 0;
  private streamingActive = false;

  constructor(
    private appendLine: (line: MessageLine) => void,
    private appendAssistantChunk: (delta: string) => void,
    private setLastMetadata: (metadata: any) => void,
    opts: {filename: string}
  ) {
    super({ filename: opts.filename });
  }

  override async emit(event: AgentEvent): Promise<void> {
    super.emit(event); // Persist event
    switch (event.type) {
      case AgentEventTypes.MessageStarted:
        // Reset tool count for new message
        this.toolCallCount = 0;
        this.streamingActive = false;
        break;

      case AgentEventTypes.ToolCalls:
        this.toolCallCount += event.toolCalls.length;
        this.appendLine({
          id: crypto.randomUUID(),
          type: 'tool',
          content: `[*] ${event.toolCalls.length > 1 ? 'tools' : 'tool'}: ${event.toolCalls.map(tc => tc.function.name).join(', ')}`,
          metadata: {
            toolCallCount: event.toolCalls.length,
            timestamp: new Date().toISOString(),
            toolCalls: event.toolCalls
          },
          color: 'blue'
        });
        break;

      case AgentEventTypes.ToolResult:
        const tool = event.result;
        const statusIcon = tool.status === 'success' ? '[+]' : '[!]';
        const duration = tool.durationMs !== undefined ? ` (${tool.durationMs}ms)` : '';

        // Format the actual result content
        // if (tool.result) {
        //   if (tool.type === 'json' && typeof tool.result === 'object') {
        //     resultContent = ` -> ${JSON.stringify(tool.result)}`;
        //   } else {
        //     resultContent = ` -> ${String(tool.result)}`;
        //   }
        // }

        this.appendLine({
          id: crypto.randomUUID(),
          type: 'tool_result',
          content: `  \\-- ${tool.name}: ${statusIcon} ${tool.status}${duration}`,
          metadata: {
            toolName: tool.name,
            status: tool.status,
            duration: tool.durationMs,
            timestamp: new Date().toISOString(),
            toolResult: tool
          },
          color: tool.status === 'success' ? 'green' : 'red'
        });
        break;

      case AgentEventTypes.AssistantChunk:
        if (!this.streamingActive) {
          this.streamingActive = true;
          this.appendLine({
            id: crypto.randomUUID(),
            type: 'assistant',
            content: 'assistant: ',
            metadata: {
              timestamp: new Date().toISOString()
            }
          });
        }
        if (event.delta) this.appendAssistantChunk(event.delta);
        break;

      case AgentEventTypes.AssistantMessage:
        if (!this.streamingActive && event.content) {
          this.appendLine({
            id: crypto.randomUUID(),
            type: 'assistant',
            content: `assistant: ${event.content}`,
            metadata: {
              timestamp: new Date().toISOString()
            }
          });
        }
        this.streamingActive = false;
        break;

      case AgentEventTypes.Done:
        // Update metadata in footer
        const usage = event.usage;
        if (usage) {
          this.setLastMetadata({
            promptTokens: usage.prompt_tokens,
            completionTokens: usage.completion_tokens,
            totalTokens: usage.total_tokens,
            responseTime: event.responseTimeMs,
            toolCalls: this.toolCallCount,
            estimatedCost: null // Could calculate if we have pricing info
          });
        }
        break;

      case AgentEventTypes.Error:
        this.appendLine({
          id: crypto.randomUUID(),
          type: 'error',
          content: `error: ${event.error}`,
          metadata: {
            timestamp: new Date().toISOString()
          },
          color: 'red'
        });
        break;
    }
  }
}

export default function App({useOpenRouter = false, useGithub = false, memPersist = false, mcpConfigPath}: Props) {
  const {exit} = useApp();
  const [lines, setLines] = useState<MessageLine[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>('Initializing...');
  const orchestratorRef = useRef<AgentOrchestrator | null>(null);
  const mcpClientsRef = useRef<CoreMCPClient[]>([]);
  const [provider, setProvider] = useState<'OpenRouter' | 'GitHub' | 'Echo'>('Echo');
  const [model, setModel] = useState<string>('demo-echo');
  const [lastMetadata, setLastMetadata] = useState<any>(null);
  const [showToolParams, setShowToolParams] = useState<boolean>(false);

  // Handle keyboard shortcuts
  useInput((input, key) => {
    if (key.tab && key.shift) {
      // Shift+Tab to toggle tool parameters
      setShowToolParams(prev => !prev);
    }
  });

  // Initialize a session directory inside .history/<timestamp> on first render
  const sessionId = useMemo(() => String(Date.now()), []);
  const sessionDir = useMemo(() => path.join('.history', sessionId), [sessionId]);

  // Custom error handler that writes to both stderr and chat
  const handleError = (message: string) => {
    appendLine({
      id: crypto.randomUUID(),
      type: 'error',
      content: `error: ${message}`,
      metadata: { timestamp: new Date().toISOString() },
      color: 'red'
    });
  };

  useEffect(() => {
    let didCancel = false;

    (async () => {
      // Ensure session directory exists
      try {
        fs.mkdirSync(sessionDir, {recursive: true});
      } catch {}

      // Provider selection
      const selectedProvider = useOpenRouter ? 'OpenRouter' : useGithub ? 'GitHub' : 'Echo';
      setProvider(selectedProvider);

      const llm = useOpenRouter
        ? new OpenRouterLLM(String(process.env.OPENROUTER_API_KEY || ''))
        : useGithub
        ? new GithubLLM({
            apiKey: process.env.GITHUB_COPILOT_API_KEY || undefined,
            accessToken: process.env.GITHUB_ACCESS_TOKEN || undefined,
          })
        : new EchoLLM();

      const resolvedModel = useOpenRouter
        ? process.env.OPENROUTER_MODEL || 'openai/gpt-4.1'
        : useGithub
        ? process.env.GITHUB_MODEL || 'gpt-4.1'
        : 'demo-echo';
      setModel(resolvedModel);

      // Memory (per-session if persisted)
      const memory = memPersist
        ? new PersistedMemory<Message>(
            new JsonFileMemoryPersistence<Message>(path.join(sessionDir, '.nuvin_history.json')),
          )
        : new InMemoryMemory<Message>();

      // Tools: local and optional MCP (persist tool names and todos under session dir)
      const toolsMemory = new PersistedMemory<string>(
        new JsonFileMemoryPersistence<string>(path.join(sessionDir, '.nuvin_tools.json')),
      );
      const todosMemory = new PersistedMemory<StoreTodo>(
        new JsonFileMemoryPersistence<StoreTodo>(path.join(sessionDir, '.nuvin_todos.json')),
      );
      const localTools = new ToolRegistry({toolsMemory, todoMemory: todosMemory});

      let toolsPort: ToolRegistry | CompositeToolPort = localTools;
      const enabledTools: string[] = ['todo_write', 'web_search', 'web_fetch'];

      const mcpPorts: MCPToolPort[] = [];
      const configPath = mcpConfigPath || '.nuvin_mcp.json';
      try {
        const cfg = await loadMCPConfig(configPath);
        if (cfg?.mcpServers) {
          for (const [serverId, serverCfg] of Object.entries(cfg.mcpServers)) {
            try {
              let client: CoreMCPClient | null = null;
              const timeoutMs = serverCfg.timeoutMs || 30000; // Default 30 seconds
              if (serverCfg.transport === 'http' && serverCfg.url) {
                client = new CoreMCPClient({
                  type: 'http',
                  url: serverCfg.url,
                  headers: serverCfg.headers
                }, timeoutMs);
              } else if (serverCfg.command) {
                client = new CoreMCPClient({
                  type: 'stdio',
                  command: serverCfg.command,
                  args: serverCfg.args,
                  env: serverCfg.env,
                  stderr: 'ignore',
                }, timeoutMs);
              }
              if (!client) {
                appendLine({
                  id: crypto.randomUUID(),
                  type: 'info',
                  content: `MCP server '${serverId}' missing transport info; skipping`,
                  metadata: { timestamp: new Date().toISOString() },
                  color: 'yellow'
                });
                continue;
              }
              const prefix = serverCfg.prefix || `mcp_${serverId}_`;
              const port = new MCPToolPort(client, {prefix});
              await port.init();
              const exposed = port.getExposedToolNames();

              if (exposed.length) {
                mcpPorts.push(port);
                mcpClientsRef.current.push(client); // Track for cleanup
                enabledTools.push(...exposed);
                appendLine({
                  id: crypto.randomUUID(),
                  type: 'info',
                  content: `MCP server '${serverId}' loaded with ${exposed.length} tools (prefix='${prefix}', timeout=${timeoutMs}ms).`,
                  metadata: { timestamp: new Date().toISOString() },
                  color: 'green'
                });
              } else {
                appendLine({
                  id: crypto.randomUUID(),
                  type: 'info',
                  content: `MCP server '${serverId}' has no tools.`,
                  metadata: { timestamp: new Date().toISOString() },
                  color: 'yellow'
                });
              }

            } catch (err: unknown) {
              const message = typeof err === 'object' && err !== null && 'message' in err
                ? (err as {message?: string}).message ?? 'Unknown error'
                : String(err);
              handleError(`Failed to initialize MCP server '${serverId}': ${message}`);
            }
          }
        }
      } catch (err: unknown) {
        const message = typeof err === 'object' && err !== null && 'message' in err
          ? (err as {message?: string}).message ?? 'Unknown error'
          : String(err);
        handleError(`Failed to load MCP config from ${configPath}: ${message}`);
      }

      if (mcpPorts.length > 0) {
        toolsPort = new CompositeToolPort([localTools, ...mcpPorts]);
      }

      const orchestrator = new AgentOrchestrator(
        {
          id: 'core-demo-agent',
          systemPrompt: prompt,
          temperature: 1,
          topP: 1,
          maxTokens: 512,
          model: resolvedModel,
          enabledTools,
          maxToolConcurrency: 3,
        },
        {
          memory,
          llm,
          tools: toolsPort,
          context: new SimpleContextBuilder(),
          ids: new SimpleId(),
          clock: new SystemClock(),
          cost: new SimpleCost(),
          reminders: new NoopReminders(),
          events: new UIEventPort(appendLine, appendAssistantChunk, setLastMetadata, {
            filename: path.join(sessionDir, '.nuvin_events.json')
          }),
        },
      );

      if (didCancel) return;
      orchestratorRef.current = orchestrator;

      appendLine({
        id: crypto.randomUUID(),
        type: 'info',
        content: mcpPorts.length > 0 ? `Loaded ${mcpPorts.length} MCP server(s) from ${configPath}.` : `No MCP servers loaded. Provide ${configPath} to enable MCP.`,
        metadata: { timestamp: new Date().toISOString() }
      });
      setStatus('Ready');
    })();

    return () => {
      didCancel = true;
      // Cleanup MCP connections on component unmount
      void cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useOpenRouter, useGithub, memPersist, mcpConfigPath]);

  const appendLine = (line: MessageLine) => setLines(prev => [...prev, line]);
  const appendAssistantChunk = (delta: string) =>
    setLines(prev => {
      if (prev.length === 0) return [...prev, {
        id: crypto.randomUUID(),
        type: 'assistant',
        content: `assistant: ${delta}`,
        metadata: { timestamp: new Date().toISOString() }
      }];
      const next = [...prev];
      // Find the last assistant line to append to; default to last line
      let idx = next.length - 1;
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].type === 'assistant') { idx = i; break; }
      }
      const current = next[idx];
      const base = current?.content ?? '';
      next[idx] = { ...current, content: base + delta };
      return next;
    });

  const cleanup = async () => {
    // Disconnect all MCP clients
    if (mcpClientsRef.current.length > 0) {
      appendLine({
        id: crypto.randomUUID(),
        type: 'info',
        content: `🔌 Disconnecting ${mcpClientsRef.current.length} MCP server${mcpClientsRef.current.length > 1 ? 's' : ''}...`,
        metadata: { timestamp: new Date().toISOString() },
        color: 'yellow'
      });

      const disconnectPromises = mcpClientsRef.current.map(async (client, index) => {
        try {
          await client.disconnect();
          appendLine({
            id: crypto.randomUUID(),
            type: 'info',
            content: `✅ MCP server ${index + 1} disconnected`,
            metadata: { timestamp: new Date().toISOString() },
            color: 'green'
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          appendLine({
            id: crypto.randomUUID(),
            type: 'error',
            content: `⚠️ Error disconnecting MCP server ${index + 1}: ${message}`,
            metadata: { timestamp: new Date().toISOString() },
            color: 'yellow'
          });
        }
      });

      await Promise.allSettled(disconnectPromises);
      mcpClientsRef.current = [];
    }
  };

  const handleSlashCommand = async (command: string, args: string): Promise<boolean> => {
    switch (command) {
      case '/exit':
        appendLine({
          id: crypto.randomUUID(),
          type: 'info',
          content: 'Goodbye!',
          metadata: { timestamp: new Date().toISOString() },
          color: 'cyan'
        });
        await cleanup();
        exit();
        return true;

      default:
        appendLine({
          id: crypto.randomUUID(),
          type: 'error',
          content: `❌ Unknown command: ${command}`,
          metadata: { timestamp: new Date().toISOString() },
          color: 'red'
        });
        appendLine({
          id: crypto.randomUUID(),
          type: 'info',
          content: 'Available commands: /exit',
          metadata: { timestamp: new Date().toISOString() },
          color: 'gray'
        });
        return true;
    }
  };

  const handleSubmit = async (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    // Handle slash commands
    if (trimmed.startsWith('/')) {
      const parts = trimmed.split(' ');
      const command = parts[0];
      const args = parts.slice(1).join(' ');

      appendLine({
        id: crypto.randomUUID(),
        type: 'user',
        content: `> ${trimmed}`,
        metadata: { timestamp: new Date().toISOString() },
        color: 'cyan'
      });
      setInput('');

      const handled = await handleSlashCommand(command, args);
      if (handled) return;
    }

    // Legacy exit commands
    if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
      appendLine({
        id: crypto.randomUUID(),
        type: 'info',
        content: 'Bye!',
        metadata: { timestamp: new Date().toISOString() }
      });
      await cleanup();
      exit();
      return;
    }

    appendLine({
      id: crypto.randomUUID(),
      type: 'user',
      content: `> ${trimmed}`,
      metadata: { timestamp: new Date().toISOString() },
      color: 'cyan'
    });
    setInput('');
    setBusy(true);

    try {
      const orch = orchestratorRef.current;
      if (!orch) throw new Error('Agent not initialized');

      // The orchestrator will emit events that our UIEventPort will handle
      // No need to manually display content - events will drive the UI updates
      await orch.send(trimmed, {conversationId: 'cli', stream: true});
    } catch (err: unknown) {
      const message = typeof err === 'object' && err !== null && 'message' in err ? (err as {message?: string}).message : String(err);
      handleError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box flexDirection="column" height="100%">
      {/* Main Chat Area */}
      <Box flexDirection="column" flexGrow={1} paddingX={1} marginBottom={1}>
        <Box flexDirection="column" minHeight={10}>
          {lines.length === 0 ? (
            <Box flexDirection="column" alignItems="center" justifyContent="center" minHeight={8}>
              <Text color="gray" dimColor>💬 Welcome! Type your message below to start chatting.</Text>
              <Text color="gray" dimColor>   Commands: '/exit' to quit, or 'exit'/'quit', Ctrl+C to force quit</Text>
              {provider === 'Echo' && (
                <Text color="yellow" dimColor>   Try: '!reverse hello world' or '!wc count these words'</Text>
              )}
            </Box>
          ) : (
            lines.map((l, i) => {
              // Use type-based logic instead of fragile string matching
              switch (l.type) {
                case 'user':
                  return (
                    <Box key={l.id || i} marginTop={1} flexDirection="row">
                      <Text color="white" bold flexShrink={0}>● </Text>
                      <Text flexShrink={1}>{l.content.startsWith('> ') ? l.content.substring(2) : l.content}</Text>
                    </Box>
                  );

                case 'assistant':
                  return (
                    <Box key={l.id || i} marginTop={1} flexDirection="row">
                      <Text color="green" bold flexShrink={0}>● </Text>
                      <Text flexShrink={1}>{l.content.startsWith('assistant: ') ? l.content.substring(11) : l.content}</Text>
                    </Box>
                  );

                case 'tool':
                  return (
                    <Box key={l.id || i} marginTop={1} flexDirection="column">
                      <Box flexDirection="row">
                        <Text color="blue" bold flexShrink={0}>● </Text>
                        <Text flexShrink={1}>{l.content}</Text>
                      </Box>
                      {showToolParams && l.metadata?.toolCalls && l.metadata.toolCalls.map((tc, tcIndex) => (
                        <Box key={tcIndex} marginLeft={2} flexDirection="column">
                          <Text color="gray">  Parameters for {tc.function.name}:</Text>
                          <Text color="gray">    {tc.function.arguments}</Text>
                        </Box>
                      ))}
                    </Box>
                  );

                case 'tool_result':
                  return (
                    <Box key={l.id || i} marginLeft={2} flexDirection="column">
                      <Box flexDirection="row">
                        <Text color={l.color as any} flexShrink={0}>  </Text>
                        <Text color={l.color as any} flexShrink={1}>{l.content}</Text>
                      </Box>
                      {showToolParams && l.metadata?.toolResult && (
                        <Box marginLeft={2} flexDirection="column">
                          <Text color="gray">    Result Details:</Text>
                          <Text color="gray">      ID: {l.metadata.toolResult.id}</Text>
                          <Text color="gray">      Type: {l.metadata.toolResult.type}</Text>
                          <Text color="gray">      Status: {l.metadata.toolResult.status}</Text>
                          {l.metadata.toolResult.durationMs !== undefined && (
                            <Text color="gray">      Duration: {l.metadata.toolResult.durationMs}ms</Text>
                          )}
                          {l.metadata.toolResult.metadata && (
                            <Text color="gray">      Metadata: {JSON.stringify(l.metadata.toolResult.metadata)}</Text>
                          )}
                          <Text color="gray">      Full Result:</Text>
                          <Text color="gray" wrap="wrap">        {typeof l.metadata.toolResult.result === 'object'
                            ? JSON.stringify(l.metadata.toolResult.result, null, 2).split('\n').map((line, idx) =>
                                idx === 0 ? line : `        ${line}`).join('\n')
                            : String(l.metadata.toolResult.result)}</Text>
                        </Box>
                      )}
                    </Box>
                  );

                case 'error':
                  return (
                    <Box key={l.id || i} flexDirection="row">
                      <Text color="red" bold flexShrink={0}>● </Text>
                      <Text flexShrink={1}>{l.content}</Text>
                    </Box>
                  );

                case 'info':
                  return (
                    <Box key={l.id || i} flexDirection="row">
                      <Text color={l.color as any || 'gray'} bold flexShrink={0}>● </Text>
                      <Text color={l.color as any} flexShrink={1}>{l.content}</Text>
                    </Box>
                  );

                case 'system':
                  return (
                    <Box key={l.id || i} flexDirection="row">
                      <Text color="yellow" bold flexShrink={0}>● </Text>
                      <Text flexShrink={1}>{l.content}</Text>
                    </Box>
                  );

                default:
                  return (
                    <Text key={l.id || i} color={l.color as any}>{l.content}</Text>
                  );
              }
            })
          )}
        </Box>
      </Box>

      {/* Input Area */}
      <Box paddingX={1} paddingY={0} borderColor="transparent" borderStyle="round" minHeight={3}>
        {busy ? (
          <Box>
            <Box marginRight={1}>
              <Spinner type="dots" />
            </Box>
            <Text color="gray">Processing your request...</Text>
          </Box>
        ) : (
          <Box>
            <Text color="green" bold>{'>'} </Text>
            <TextInput
              value={input}
              onChange={setInput}
              onSubmit={handleSubmit}
              placeholder="Type your message..."
            />
          </Box>
        )}
      </Box>

      {/* Footer with model info, status and metadata */}
      <Box paddingX={1} justifyContent="space-between" flexDirection="column">
        <Box justifyContent="space-between">
          <Text color="gray" dimColor>
            {provider} | {model} | <Text color="green">●</Text> {status}
          </Text>
          {lastMetadata && (
            <Text color="gray" dimColor>
              tokens: p:{lastMetadata.promptTokens ?? '-'} c:{lastMetadata.completionTokens ?? '-'} t:{lastMetadata.totalTokens ?? '-'} | cost: {lastMetadata.estimatedCost != null ? `$${Number(lastMetadata.estimatedCost).toFixed(6)}` : 'n/a'} | time: {lastMetadata.responseTime != null ? `${lastMetadata.responseTime}ms` : 'n/a'} | tools: {lastMetadata.toolCalls != null ? `${lastMetadata.toolCalls}` : '0'}
            </Text>
          )}
        </Box>
        <Text color="gray" dimColor>
          Shift+Tab: {showToolParams ? 'Hide' : 'Show'} tool parameters & results
        </Text>
      </Box>
    </Box>
  );
}
