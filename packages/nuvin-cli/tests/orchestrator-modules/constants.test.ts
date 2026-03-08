import { describe, it, expect } from 'vitest';
import {
  defaultModels,
  defaultSmallModels,
  baseEnabledTools,
  getEnabledTools,
  resolveMemoryExtractionConfig,
  INTERNAL_MEMORY_EXTRACTOR_AGENT,
  INTERNAL_MEMORY_EXTRACTOR_INSTRUCTIONS,
} from '../../source/services/orchestrator-modules/constants.js';

describe('orchestrator-modules/constants', () => {
  describe('defaultModels', () => {
    it('should have entries for all supported providers', () => {
      expect(defaultModels.openrouter).toBeDefined();
      expect(defaultModels.anthropic).toBeDefined();
      expect(defaultModels.deepinfra).toBeDefined();
      expect(defaultModels.github).toBeDefined();
      expect(defaultModels.zai).toBeDefined();
      expect(defaultModels.moonshot).toBeDefined();
    });
  });

  describe('defaultSmallModels', () => {
    it('should have entries for all supported providers', () => {
      expect(defaultSmallModels.openrouter).toBeDefined();
      expect(defaultSmallModels.anthropic).toBeDefined();
      expect(defaultSmallModels.deepinfra).toBeDefined();
      expect(defaultSmallModels.github).toBeDefined();
      expect(defaultSmallModels.zai).toBeDefined();
      expect(defaultSmallModels.moonshot).toBeDefined();
    });
  });

  describe('baseEnabledTools', () => {
    it('should include all core tools', () => {
      expect(baseEnabledTools).toContain('bash_tool');
      expect(baseEnabledTools).toContain('file_read');
      expect(baseEnabledTools).toContain('file_edit');
      expect(baseEnabledTools).toContain('file_new');
      expect(baseEnabledTools).toContain('grep_tool');
      expect(baseEnabledTools).toContain('glob_tool');
      expect(baseEnabledTools).toContain('ls_tool');
      expect(baseEnabledTools).toContain('web_search');
      expect(baseEnabledTools).toContain('web_fetch');
      expect(baseEnabledTools).toContain('assign_task');
      expect(baseEnabledTools).toContain('lsp');
      expect(baseEnabledTools).toContain('skill');
      expect(baseEnabledTools).toContain('ask_user_tool');
      expect(baseEnabledTools).toContain('todo_write');
    });

    it('should include memory tools', () => {
      expect(baseEnabledTools).toContain('memory_save');
      expect(baseEnabledTools).toContain('memory_query');
      expect(baseEnabledTools).toContain('memory_extract');
    });
  });

  describe('getEnabledTools', () => {
    it('should return all base tools when no memory config provided', () => {
      const tools = getEnabledTools();
      expect(tools).toEqual(baseEnabledTools);
    });

    it('should remove all memory tools when memory is disabled', () => {
      const tools = getEnabledTools({ enabled: false });
      expect(tools).not.toContain('memory_save');
      expect(tools).not.toContain('memory_query');
      expect(tools).not.toContain('memory_extract');
    });

    it('should remove memory_save when saveTool is false', () => {
      const tools = getEnabledTools({ saveTool: false });
      expect(tools).not.toContain('memory_save');
      expect(tools).toContain('memory_query');
      expect(tools).toContain('memory_extract');
    });

    it('should remove memory_query when active retrieval is disabled', () => {
      const tools = getEnabledTools({ retrieval: { activeEnabled: false } });
      expect(tools).not.toContain('memory_query');
      expect(tools).toContain('memory_save');
    });

    it('should remove memory_extract when extraction is disabled', () => {
      const tools = getEnabledTools({ extraction: { enabled: false } });
      expect(tools).not.toContain('memory_extract');
      expect(tools).toContain('memory_save');
      expect(tools).toContain('memory_query');
    });
  });

  describe('resolveMemoryExtractionConfig', () => {
    it('should return enabled by default when no config', () => {
      const resolved = resolveMemoryExtractionConfig({});
      expect(resolved.enabled).toBe(true);
      expect(resolved.sensitiveFilter).toBe(true);
    });

    it('should respect extraction.enabled = false', () => {
      const resolved = resolveMemoryExtractionConfig({
        extraction: { enabled: false },
      });
      expect(resolved.enabled).toBe(false);
    });

    it('should respect memory.enabled = false', () => {
      const resolved = resolveMemoryExtractionConfig({
        enabled: false,
        extraction: { enabled: true },
      });
      expect(resolved.enabled).toBe(false);
    });

    it('should pass through provider and model from extraction config', () => {
      const resolved = resolveMemoryExtractionConfig({
        extraction: { provider: 'anthropic', model: 'claude-3' },
      });
      expect(resolved.provider).toBe('anthropic');
      expect(resolved.model).toBe('claude-3');
    });

    it('should fall back to top-level provider/model', () => {
      const resolved = resolveMemoryExtractionConfig({
        provider: 'openrouter',
        model: 'gpt-4',
      });
      expect(resolved.provider).toBe('openrouter');
      expect(resolved.model).toBe('gpt-4');
    });
  });

  describe('INTERNAL_MEMORY_EXTRACTOR_AGENT', () => {
    it('should be a non-empty string', () => {
      expect(INTERNAL_MEMORY_EXTRACTOR_AGENT).toBe('__memory_extractor_internal');
    });
  });

  describe('INTERNAL_MEMORY_EXTRACTOR_INSTRUCTIONS', () => {
    it('should contain extraction pipeline instructions', () => {
      expect(INTERNAL_MEMORY_EXTRACTOR_INSTRUCTIONS).toContain('Extraction Pipeline');
      expect(INTERNAL_MEMORY_EXTRACTOR_INSTRUCTIONS).toContain('memory_query');
      expect(INTERNAL_MEMORY_EXTRACTOR_INSTRUCTIONS).toContain('memory_save');
    });
  });
});
