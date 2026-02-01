import { describe, it, expect } from 'vitest';
import { getToolDisplayName } from '@/components/ToolCallViewer/registry.js';

describe('getToolDisplayName', () => {
  it('should return string displayName for tools with static displayName', () => {
    expect(getToolDisplayName('bash_tool')).toBe('Run');
    expect(getToolDisplayName('grep_tool')).toBe('Search');
    expect(getToolDisplayName('glob_tool')).toBe('Find files');
    expect(getToolDisplayName('web_search')).toBe('Search');
  });

  it('should return toolName for tools with function-based displayName', () => {
    // file_read has a function-based displayName
    expect(getToolDisplayName('file_read')).toBe('file_read');
  });

  it('should return toolName for unknown tools', () => {
    expect(getToolDisplayName('unknown_tool')).toBe('unknown_tool');
    expect(getToolDisplayName('custom_tool')).toBe('custom_tool');
  });

  it('should handle empty string displayName', () => {
    // Unknown tools use DEFAULT_CONFIG with displayName: ''
    const result = getToolDisplayName('totally_unknown');
    expect(result).toBe('totally_unknown');
  });
});
