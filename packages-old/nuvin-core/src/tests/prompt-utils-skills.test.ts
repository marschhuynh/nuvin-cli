import { describe, it, expect } from 'vitest';
import { buildInjectedSystem } from '../prompt-utils.js';

const baseParams = {
  today: '2026-02-12',
  platform: 'darwin',
  arch: 'arm64',
  tempDir: '/tmp',
  workspaceDir: '/workspace',
};

describe('buildInjectedSystem - skills', () => {
  it('does not include skills section when no skills provided', () => {
    const result = buildInjectedSystem(baseParams);
    expect(result).not.toContain('Available skills');
  });

  it('does not include skills section when empty array', () => {
    const result = buildInjectedSystem({ ...baseParams, availableSkills: [] });
    expect(result).not.toContain('Available skills');
  });

  it('lists skills in name: description format', () => {
    const result = buildInjectedSystem({
      ...baseParams,
      availableSkills: [
        { name: 'test-driven-development', description: 'Use when implementing features' },
        { name: 'brainstorming', description: 'Use before creative work' },
      ],
    });

    expect(result).toContain('- test-driven-development: Use when implementing features');
    expect(result).toContain('- brainstorming: Use before creative work');
  });

  it('renders skills section after folder structure', () => {
    const result = buildInjectedSystem({
      ...baseParams,
      folderTree: 'src/\n  index.ts',
      availableSkills: [
        { name: 'my-skill', description: 'A skill' },
      ],
    });

    const folderIdx = result.indexOf('Folder structure:');
    const skillIdx = result.indexOf('Available skills');
    expect(folderIdx).toBeGreaterThan(-1);
    expect(skillIdx).toBeGreaterThan(folderIdx);
  });
});
