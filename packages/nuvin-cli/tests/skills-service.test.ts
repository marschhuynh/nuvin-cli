import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillsService } from '../source/services/SkillsService.js';
import { validateSkillFrontmatter } from '../source/types/skills.js';

describe('SkillsService', () => {
  let tempDir: string;
  let skillsService: SkillsService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-test-'));
    SkillsService.resetInstance();
    skillsService = SkillsService.createWithHomeDir(tempDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('discover', () => {
    it('should discover skills from .nuvin/skills directory', async () => {
      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'test-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: test-skill
description: A test skill for unit testing
---

# Test Skill

This is a test skill.
`,
      );

      const result = await skillsService.discover(tempDir);

      expect(Object.keys(result.skills)).toHaveLength(1);
      expect(result.skills['test-skill']).toBeDefined();
      expect(result.skills['test-skill'].name).toBe('test-skill');
      expect(result.skills['test-skill'].description).toBe('A test skill for unit testing');
      expect(result.errors).toHaveLength(0);
    });

    it('should discover skills from .claude/skills directory', async () => {
      const skillDir = path.join(tempDir, '.claude', 'skills', 'claude-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: claude-skill
description: A Claude Code compatible skill
---

# Claude Skill
`,
      );

      const result = await skillsService.discover(tempDir);

      expect(result.skills['claude-skill']).toBeDefined();
      expect(result.skills['claude-skill'].description).toBe('A Claude Code compatible skill');
    });

    it('should report error for invalid frontmatter', async () => {
      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'bad-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: bad-skill
---

Missing description field.
`,
      );

      const result = await skillsService.discover(tempDir);

      expect(Object.keys(result.skills)).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('invalid-frontmatter');
    });

    it('should report error when skill name does not match directory name', async () => {
      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'my-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: different-name
description: Name mismatch test
---

Content
`,
      );

      const result = await skillsService.discover(tempDir);

      expect(Object.keys(result.skills)).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].type).toBe('invalid-name');
      expect(result.errors[0].message).toContain('must match directory name');
    });

    it('should exclude skills in exclude list', async () => {
      const skill1Dir = path.join(tempDir, '.nuvin', 'skills', 'skill-one');
      const skill2Dir = path.join(tempDir, '.nuvin', 'skills', 'skill-two');
      await fs.mkdir(skill1Dir, { recursive: true });
      await fs.mkdir(skill2Dir, { recursive: true });

      await fs.writeFile(
        path.join(skill1Dir, 'SKILL.md'),
        `---
name: skill-one
description: First skill
---
`,
      );
      await fs.writeFile(
        path.join(skill2Dir, 'SKILL.md'),
        `---
name: skill-two
description: Second skill
---
`,
      );

      skillsService.setConfig({ exclude: ['skill-one'] });
      const result = await skillsService.discover(tempDir);

      expect(Object.keys(result.skills)).toHaveLength(1);
      expect(result.skills['skill-two']).toBeDefined();
      expect(result.skills['skill-one']).toBeUndefined();
    });

    it('should discover skills from custom directories', async () => {
      const customDir = path.join(tempDir, 'custom-skills', 'my-custom-skill');
      await fs.mkdir(customDir, { recursive: true });
      await fs.writeFile(
        path.join(customDir, 'SKILL.md'),
        `---
name: my-custom-skill
description: Custom directory skill
---
`,
      );

      skillsService.setConfig({ directories: [path.join(tempDir, 'custom-skills')] });
      const result = await skillsService.discover(tempDir);

      expect(result.skills['my-custom-skill']).toBeDefined();
    });
  });

  describe('get', () => {
    it('should return skill info by name', async () => {
      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'get-test');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: get-test
description: Test for get method
---
`,
      );

      await skillsService.discover(tempDir);
      const skill = await skillsService.get('get-test');

      expect(skill).not.toBeNull();
      expect(skill?.name).toBe('get-test');
    });

    it('should return null for non-existent skill', async () => {
      await skillsService.discover(tempDir);
      const skill = await skillsService.get('non-existent');

      expect(skill).toBeNull();
    });
  });

  describe('loadFull', () => {
    it('should load full skill content', async () => {
      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'full-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: full-skill
description: Full skill test
license: MIT
compatibility: Requires Node.js 18+
metadata:
  author: test-author
  version: "1.0"
allowed-tools: bash_tool file_read
---

# Full Skill

## Instructions

1. Do this
2. Do that
`,
      );

      await skillsService.discover(tempDir);
      const skill = await skillsService.loadFull('full-skill');

      expect(skill).not.toBeNull();
      expect(skill?.name).toBe('full-skill');
      expect(skill?.license).toBe('MIT');
      expect(skill?.compatibility).toBe('Requires Node.js 18+');
      expect(skill?.metadata?.author).toBe('test-author');
      expect(skill?.allowedTools).toEqual(['bash_tool', 'file_read']);
      expect(skill?.content).toContain('# Full Skill');
    });

    it('should detect optional directories', async () => {
      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'dir-skill');
      await fs.mkdir(path.join(skillDir, 'scripts'), { recursive: true });
      await fs.mkdir(path.join(skillDir, 'references'), { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: dir-skill
description: Skill with directories
---
`,
      );

      await skillsService.discover(tempDir);
      const skill = await skillsService.loadFull('dir-skill');

      expect(skill?.hasScripts).toBe(true);
      expect(skill?.hasReferences).toBe(true);
      expect(skill?.hasAssets).toBe(false);
    });
  });

  describe('isEnabled', () => {
    it('should return true by default', () => {
      const enabled = skillsService.isEnabled('any-skill');
      expect(enabled).toBe(true);
    });

    it('should return configured enabled state', () => {
      skillsService.setConfig({
        enabledSkills: {
          'disabled-skill': false,
          'enabled-skill': true,
        },
      });

      expect(skillsService.isEnabled('disabled-skill')).toBe(false);
      expect(skillsService.isEnabled('enabled-skill')).toBe(true);
      expect(skillsService.isEnabled('other-skill')).toBe(true);
    });
  });

  describe('buildToolDescription', () => {
    it('should return no skills message when empty', async () => {
      await skillsService.discover(tempDir);
      const description = skillsService.buildToolDescription();

      expect(description).toContain('No skills are currently available');
    });

    it('should include available skills in XML format', async () => {
      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'xml-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: xml-skill
description: Skill for XML test
---
`,
      );

      await skillsService.discover(tempDir);
      const description = skillsService.buildToolDescription();

      expect(description).toContain('- xml-skill: Skill for XML test');
    });
  });
});

describe('validateSkillFrontmatter', () => {
  it('should validate valid frontmatter', () => {
    const result = validateSkillFrontmatter({
      name: 'valid-skill',
      description: 'A valid skill description',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('valid-skill');
      expect(result.data.description).toBe('A valid skill description');
    }
  });

  it('should reject missing name', () => {
    const result = validateSkillFrontmatter({
      description: 'Missing name',
    });

    expect(result.success).toBe(false);
  });

  it('should reject missing description', () => {
    const result = validateSkillFrontmatter({
      name: 'no-description',
    });

    expect(result.success).toBe(false);
  });

  it('should reject invalid name format', () => {
    const invalidNames = ['UPPERCASE', 'has spaces', 'has_underscore', '-starts-with-dash', 'ends-with-dash-'];

    for (const name of invalidNames) {
      const result = validateSkillFrontmatter({
        name,
        description: 'Test',
      });
      expect(result.success).toBe(false);
    }
  });

  it('should accept valid name formats', () => {
    const validNames = ['simple', 'with-dash', 'multi-word-name', 'a1', 'skill123'];

    for (const name of validNames) {
      const result = validateSkillFrontmatter({
        name,
        description: 'Test',
      });
      expect(result.success).toBe(true);
    }
  });

  it('should reject name longer than 64 characters', () => {
    const result = validateSkillFrontmatter({
      name: 'a'.repeat(65),
      description: 'Test',
    });

    expect(result.success).toBe(false);
  });

  it('should reject description longer than 1024 characters', () => {
    const result = validateSkillFrontmatter({
      name: 'test',
      description: 'a'.repeat(1025),
    });

    expect(result.success).toBe(false);
  });

  it('should accept optional fields', () => {
    const result = validateSkillFrontmatter({
      name: 'full-skill',
      description: 'Full featured skill',
      license: 'MIT',
      compatibility: 'Node.js 18+',
      metadata: { author: 'test', version: '1.0' },
      'allowed-tools': 'bash_tool file_read',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.license).toBe('MIT');
      expect(result.data.compatibility).toBe('Node.js 18+');
      expect(result.data.metadata).toEqual({ author: 'test', version: '1.0' });
      expect(result.data['allowed-tools']).toBe('bash_tool file_read');
    }
  });
});
