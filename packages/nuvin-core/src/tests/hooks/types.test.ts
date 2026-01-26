import { describe, it, expect } from 'vitest';
import {
	HookEventTypes,
	HookDecision,
	type HookResult,
	type HookContext,
	type HookPort,
} from '../../hooks/types.js';

describe('Hook Types', () => {
	it('should define hook event types', () => {
		expect(HookEventTypes.PreToolUse).toBe('pre_tool_use');
		expect(HookEventTypes.PostToolUse).toBe('post_tool_use');
		expect(HookEventTypes.PreUserPrompt).toBe('pre_user_prompt');
		expect(HookEventTypes.PreStop).toBe('pre_stop');
		expect(HookEventTypes.SessionStart).toBe('session_start');
		expect(HookEventTypes.SessionEnd).toBe('session_end');
	});

	it('should define hook decision types', () => {
		expect(HookDecision.Allow).toBe('allow');
		expect(HookDecision.Deny).toBe('deny');
		expect(HookDecision.Ask).toBe('ask');
	});

	it('should define hook result interface', () => {
		const result: HookResult = {
			continue: true,
			exitCode: 0,
		};
		expect(result.continue).toBe(true);
		expect(result.exitCode).toBe(0);
	});

	it('should define hook result with all optional fields', () => {
		const result: HookResult = {
			decision: 'allow',
			decisionReason: 'Approved by policy',
			updatedInput: { command: 'ls -la' },
			additionalContext: 'Extra context info',
			continue: true,
			stopReason: undefined,
			suppressOutput: false,
			systemMessage: 'System says hi',
			rawOutput: '{"status": "ok"}',
			exitCode: 0,
			error: undefined,
			durationMs: 150,
		};
		expect(result.decision).toBe('allow');
		expect(result.durationMs).toBe(150);
	});

	it('should define hook context interface', () => {
		const context: HookContext = {
			sessionId: 'test-session',
			conversationId: 'test-convo',
			messageId: 'test-msg',
			hookEvent: HookEventTypes.PreToolUse,
			cwd: '/test',
			toolName: 'bash_tool',
			toolInput: { command: 'ls' },
			toolUseId: 'tool-123',
		};
		expect(context.toolName).toBe('bash_tool');
		expect(context.hookEvent).toBe('pre_tool_use');
	});

	it('should define hook context with all optional fields', () => {
		const context: HookContext = {
			sessionId: 'test-session',
			conversationId: 'test-convo',
			messageId: 'test-msg',
			hookEvent: HookEventTypes.PostToolUse,
			cwd: '/test',
			toolName: 'bash_tool',
			toolInput: { command: 'ls' },
			toolUseId: 'tool-123',
			toolResponse: { stdout: 'file.txt', exitCode: 0 },
			prompt: 'List files',
			agentId: 'agent-1',
			agentType: 'specialist',
			permissionType: 'write',
		};
		expect(context.toolResponse).toEqual({ stdout: 'file.txt', exitCode: 0 });
		expect(context.agentType).toBe('specialist');
	});

	it('should define HookPort interface structure', () => {
		const mockPort: HookPort = {
			executeHook: async (context: HookContext): Promise<HookResult> => ({
				continue: true,
				exitCode: 0,
			}),
			hasHooks: (event: string, matcher?: string): boolean => true,
		};

		expect(typeof mockPort.executeHook).toBe('function');
		expect(typeof mockPort.hasHooks).toBe('function');
	});

	it('should define all hook event types from the spec', () => {
		// Verify all event types exist
		expect(HookEventTypes.PreUserPrompt).toBe('pre_user_prompt');
		expect(HookEventTypes.PreToolUse).toBe('pre_tool_use');
		expect(HookEventTypes.PermissionRequest).toBe('permission_request');
		expect(HookEventTypes.PostToolUse).toBe('post_tool_use');
		expect(HookEventTypes.PreSubAgent).toBe('pre_sub_agent');
		expect(HookEventTypes.PostSubAgent).toBe('post_sub_agent');
		expect(HookEventTypes.PreStop).toBe('pre_stop');
		expect(HookEventTypes.SessionStart).toBe('session_start');
		expect(HookEventTypes.SessionEnd).toBe('session_end');
	});

	it('should define all hook decision types', () => {
		expect(HookDecision.Allow).toBe('allow');
		expect(HookDecision.Deny).toBe('deny');
		expect(HookDecision.Ask).toBe('ask');
		expect(HookDecision.Block).toBe('block');
	});
});
