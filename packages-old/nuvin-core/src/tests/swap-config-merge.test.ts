import { describe, it, expect } from 'vitest';
import { mergeAgentConfig } from '../swap-config.js';
import type { AgentConfig } from '../ports.js';
import type { CompleteAgent } from '../agent-types.js';

describe('mergeAgentConfig', () => {
  const mainConfig: AgentConfig = {
    id: 'main-agent',
    systemPrompt: 'You are a main agent.',
    topP: 0.8,
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 4000,
    enabledTools: ['file_read', 'ls_tool'],
    maxToolConcurrency: 5,
    requireToolApproval: false,
    reasoningEffort: 'low',
    thinking: 'OFF',
    strictToolValidation: true,
  };

  const createCompleteAgent = (overrides: Partial<CompleteAgent> = {}): CompleteAgent => ({
    name: 'Sub Agent',
    description: 'A sub agent',
    instructions: 'You are a sub agent.',
    allowed_tools: ['file_read'],
    temperature: 0.7,
    max_tokens: 4000,
    ...overrides,
  });

  describe('systemPrompt', () => {
    it('should use sub-agent instructions when provided', () => {
      const subAgent = createCompleteAgent({
        instructions: 'You are a specialized sub-agent.',
      });

      const result = mergeAgentConfig(mainConfig, subAgent);

      expect(result.systemPrompt).toBe('You are a specialized sub-agent.');
    });
  });

  describe('enabledTools', () => {
    it('should use sub-agent allowed_tools when specified and non-empty', () => {
      const subAgent = createCompleteAgent({
        allowed_tools: ['file_read', 'file_edit', 'web_search'],
      });

      const result = mergeAgentConfig(mainConfig, subAgent);

      expect(result.enabledTools).toEqual(['file_read', 'file_edit', 'web_search']);
    });

    it('should use main config tools when sub-agent allowed_tools is empty array', () => {
      const subAgent = createCompleteAgent({
        allowed_tools: [],
      });

      const result = mergeAgentConfig(mainConfig, subAgent);

      expect(result.enabledTools).toEqual(['file_read', 'ls_tool']);
    });
  });

  describe('id', () => {
    it('should prefix id with swapped-', () => {
      const subAgent = createCompleteAgent({
        name: 'security-auditor',
      });

      const result = mergeAgentConfig(mainConfig, subAgent);

      expect(result.id).toBe('swapped-security-auditor');
    });
  });

  describe('other fields', () => {
    it('should use sub-agent values when provided', () => {
      const subAgent = createCompleteAgent({
        top_p: 0.9,
        model: 'claude-3-sonnet',
        temperature: 0.5,
        max_tokens: 8000,
      });

      const result = mergeAgentConfig(mainConfig, subAgent);

      expect(result.topP).toBe(0.9);
      expect(result.model).toBe('claude-3-sonnet');
      expect(result.temperature).toBe(0.5);
      expect(result.maxTokens).toBe(8000);
    });

    it('should fall back to main config when sub-agent values are undefined', () => {
      const subAgent = createCompleteAgent({
        top_p: undefined,
        model: undefined,
      });

      const result = mergeAgentConfig(mainConfig, subAgent);

      expect(result.topP).toBe(0.8);
      expect(result.model).toBe('gpt-4');
    });
  });

  describe('fields always from main config', () => {
    it('should use main config for maxToolConcurrency', () => {
      const subAgent = createCompleteAgent();

      const result = mergeAgentConfig(mainConfig, subAgent);

      expect(result.maxToolConcurrency).toBe(5);
    });

    it('should use main config for requireToolApproval', () => {
      const subAgent = createCompleteAgent();

      const result = mergeAgentConfig(mainConfig, subAgent);

      expect(result.requireToolApproval).toBe(false);
    });

    it('should use main config for reasoningEffort', () => {
      const subAgent = createCompleteAgent();

      const result = mergeAgentConfig(mainConfig, subAgent);

      expect(result.reasoningEffort).toBe('low');
    });

    it('should use main config for thinking', () => {
      const subAgent = createCompleteAgent();

      const result = mergeAgentConfig(mainConfig, subAgent);

      expect(result.thinking).toBe('OFF');
    });
  });
});
