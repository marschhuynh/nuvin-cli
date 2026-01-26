import type { HooksConfig, HookDefinition, HookEventConfig } from './types.js';

/**
 * Hook definition as it appears in agent frontmatter YAML.
 * This is the array item format - hooks are specified as arrays under each event type.
 */
export interface FrontmatterHookDef {
	matcher?: string;
	command?: {
		command: string;
		timeout?: number;
	};
	prompt?: {
		prompt: string;
		timeout?: number;
	};
	enabled?: boolean;
	once?: boolean;
}

/**
 * Hooks section as it appears in agent frontmatter.
 * Each event type maps to an array of hook definitions.
 */
export interface FrontmatterHooks {
	pre_user_prompt?: FrontmatterHookDef[];
	pre_tool_use?: FrontmatterHookDef[];
	permission_request?: FrontmatterHookDef[];
	post_tool_use?: FrontmatterHookDef[];
	pre_sub_agent?: FrontmatterHookDef[];
	post_sub_agent?: FrontmatterHookDef[];
	pre_stop?: FrontmatterHookDef[];
	session_start?: FrontmatterHookDef[];
	session_end?: FrontmatterHookDef[];
}

/**
 * Agent frontmatter with optional hooks section.
 */
export interface AgentFrontmatter {
	hooks?: FrontmatterHooks;
	// Other frontmatter fields can be added here
}

/**
 * Converts a frontmatter hook definition to internal HookDefinition format.
 */
function convertHookDef(def: FrontmatterHookDef): HookDefinition {
	return {
		matcher: def.matcher,
		command: def.command,
		prompt: def.prompt,
		enabled: def.enabled,
		once: def.once,
	};
}

/**
 * Converts an array of frontmatter hooks to HookEventConfig format.
 */
function convertHookArray(defs: FrontmatterHookDef[]): HookEventConfig {
	return {
		hooks: defs.map(convertHookDef),
	};
}

/**
 * Loads hooks configuration from agent frontmatter.
 * Converts the frontmatter format (arrays) to internal HooksConfig format.
 *
 * @param frontmatter - Parsed agent frontmatter YAML
 * @returns HooksConfig suitable for use with HookRegistry
 */
export function loadHooksFromFrontmatter(frontmatter: AgentFrontmatter): HooksConfig {
	const config: HooksConfig = {};

	if (!frontmatter.hooks) {
		return config;
	}

	const eventTypes = [
		'pre_user_prompt',
		'pre_tool_use',
		'permission_request',
		'post_tool_use',
		'pre_sub_agent',
		'post_sub_agent',
		'pre_stop',
		'session_start',
		'session_end',
	] as const;

	for (const eventType of eventTypes) {
		const hooks = frontmatter.hooks[eventType];
		if (hooks && hooks.length > 0) {
			config[eventType] = convertHookArray(hooks);
		}
	}

	return config;
}
