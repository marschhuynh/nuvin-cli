import {
  type AgentDefinitionReference,
  ConfigManager,
  discoverAgentDefinitionsFromDirectories,
  loadAgentDefinitionFromReference,
  loadEnvConfig,
  ProfileManager,
  resolveAgentDirectories,
  resolveConfigDirName,
} from "@nuvin/config";
import { render } from "@nuvin/ink";
import { Agent } from "@nuvin/nuvin-core/agent";
import type { AgentEvent, AgentOptions, ToolUseBlock } from "@nuvin/nuvin-core/shared";
import {
  createBashTool,
  createDelegationTools,
  createFileEditTool,
  createFileNewTool,
  createFileReadTool,
  createGlobTool,
  createGrepTool,
  createLsTool,
  type DelegatedAgentDefinition,
} from "@nuvin/nuvin-core/tools";
import { AgentChannel } from "#src/lib/agent-channel.js";
import { createChatModelFromConfig } from "#src/lib/chat/model.js";
import type { ThemeRuntimeOptions } from "#src/lib/theme/runtime.js";
import { initThemeStore } from "#src/lib/theme/store.js";

import { App } from "./app.js";

const ENTER_ALT_SCREEN = "\x1b[?1049h";
const EXIT_ALT_SCREEN = "\x1b[?1049l";

export const TUI_COORDINATOR_AGENT_ID = "assistant";

export async function main() {
  // ---------- Configuration ----------
  const configDirName = resolveConfigDirName();
  const profileManager = new ProfileManager({ configDirName });
  const activeProfile = await profileManager.getActive();
  const configManager = new ConfigManager({ configDirName });
  await configManager.load({ profile: activeProfile });
  configManager.loadConfig(loadEnvConfig(), "env");
  const config = configManager.getConfig();

  // ---------- Theme ----------
  const themeOptions: ThemeRuntimeOptions = {};
  if (config.ui?.theme?.mode) themeOptions.mode = config.ui.theme.mode;
  if (config.ui?.theme?.colorLevel) themeOptions.colorLevel = config.ui.theme.colorLevel;
  if (config.ui?.theme?.backgrounds) themeOptions.backgrounds = config.ui.theme.backgrounds;
  initThemeStore(themeOptions);

  // ---------- Chat model ----------
  const { chatModel, modelName } = createChatModelFromConfig(config, {
    reasoning: { auto: { effort: "medium" } },
  });

  // ---------- Agent <-> UI channel ----------
  // The Agent is constructed below (before React mounts) but the message
  // and approval state lives inside <App />. The channel decouples them:
  // the Agent publishes events / requests tool decisions on the channel;
  // <App /> subscribes and registers a decider on mount.
  const channel = new AgentChannel();

  const defaultCwd = process.cwd();
  const createShellTool = () => createBashTool({ defaultCwd });
  const createFileRead = () => createFileReadTool({ defaultCwd });
  const createLs = () => createLsTool({ defaultCwd });
  const createGlob = () => createGlobTool({ defaultCwd });
  const createGrep = () => createGrepTool({ defaultCwd });
  const createFileNew = () => createFileNewTool({ defaultCwd });
  const createFileEdit = () => createFileEditTool({ defaultCwd });

  const isDelegateEnabled = (agentId: string, defaultEnabled: boolean): boolean =>
    config.agentsEnabled?.[agentId] ?? defaultEnabled;

  const delegations: Record<string, DelegatedAgentDefinition> = {};
  const enabledDelegateDescriptions: Array<{
    id: string;
    description?: string;
  }> = [];

  if (config.agents?.enabled !== false) {
    const agentDirectories = resolveAgentDirectories(configManager, {
      profile: activeProfile,
    });
    const agentReferences: AgentDefinitionReference[] =
      await discoverAgentDefinitionsFromDirectories(agentDirectories);

    for (const reference of agentReferences) {
      if (!isDelegateEnabled(reference.id, reference.enabled !== false)) continue;

      enabledDelegateDescriptions.push({
        id: reference.id,
        description: reference.description,
      });
      delegations[reference.id] = async (ctx): Promise<AgentOptions> => {
        const definition = await loadAgentDefinitionFromReference(reference);
        const scope = ctx?.toolCallId
          ? { agentId: reference.id, parentToolCallId: ctx?.toolCallId }
          : undefined;

        return {
          systemPrompt: definition.systemPrompt,
          chatModel,
          tools: [
            createFileRead(),
            createLs(),
            createGlob(),
            createGrep(),
            createFileNew(),
            createFileEdit(),
            createShellTool(),
          ],
          onEvent: (event: AgentEvent) => channel.publishEvent(event, scope),
          onToolCall: (toolCall: ToolUseBlock) =>
            channel.requestToolDecision({
              toolCall,
              agentId: reference.id,
              parentToolCallId: ctx?.toolCallId,
            }),
        };
      };
    }
  }

  // ---------- Coordinator system prompt ----------
  const delegationInstructions =
    enabledDelegateDescriptions.length > 0
      ? [
          "Delegate focused research or implementation subtasks with AssignTask when another specialist can help.",
          "Available delegated agents:",
          ...enabledDelegateDescriptions.map(
            (entry) => `- "${entry.id}": ${entry.description ?? "No description provided."}`,
          ),
          "Delegated tasks run to completion and return their result through AssignTask.",
        ].join("\n")
      : "Handle tasks directly with the available workspace tools; no delegated agents are currently enabled.";

  const coordinatorSystemPrompt = `You are a terminal coding assistant.
Use FileRead, Ls, Glob, and Grep for workspace inspection.
Use FileNew and FileEdit for file changes.
Use Bash only when shell execution is necessary.
${delegationInstructions}
Be concise, explain what you are doing, and prefer direct implementation steps.`;

  // ---------- Agent ----------
  const delegationTools =
    Object.keys(delegations).length > 0 ? createDelegationTools({ agents: delegations }) : [];

  const agent = new Agent({
    systemPrompt: coordinatorSystemPrompt,
    chatModel,
    tools: [
      ...delegationTools,
      createFileRead(),
      createLs(),
      createGlob(),
      createGrep(),
      createFileNew(),
      createFileEdit(),
      createShellTool(),
    ],
    onEvent: (event) => channel.publishEvent(event),
    onToolCall: (toolCall) =>
      channel.requestToolDecision({
        toolCall,
        agentId: TUI_COORDINATOR_AGENT_ID,
      }),
  });

  // ---------- Render ----------
  process.stdout.write(ENTER_ALT_SCREEN);
  const cleanup = () => {
    process.stdout.write(EXIT_ALT_SCREEN);
  };

  const { waitUntilExit } = render(<App agent={agent} channel={channel} modelName={modelName} />, {
    exitOnCtrlC: false,
    patchConsole: true,
    incrementalRendering: true,
  });

  try {
    await waitUntilExit();
  } finally {
    cleanup();
  }
}
