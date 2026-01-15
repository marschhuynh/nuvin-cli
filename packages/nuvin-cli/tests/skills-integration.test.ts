import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { ToolRegistry } from '@nuvin/nuvin-core';
import { SkillsService } from '../source/services/SkillsService.js';

describe('Skills Integration', () => {
  let tempDir: string;
  let skillsService: SkillsService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-integration-'));
    SkillsService.resetInstance();
    skillsService = SkillsService.getInstance();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('ToolRegistry + SkillsService integration', () => {
    it('should register skill tool and connect to SkillsService', async () => {
      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'test-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: test-skill
description: A test skill for integration testing
---

# Test Skill

## Instructions

1. Step one
2. Step two
`,
      );

      await skillsService.discover(tempDir);

      const toolRegistry = new ToolRegistry({ enableSkills: true });
      toolRegistry.setSkillProvider(skillsService);

      const definitions = toolRegistry.getToolDefinitions(['skill']);
      expect(definitions).toHaveLength(1);
      expect(definitions[0].function.name).toBe('skill');
      expect(definitions[0].function.description).toContain('<available_skills>');
      expect(definitions[0].function.description).toContain('<name>test-skill</name>');
    });

    it('should execute skill tool and return skill content', async () => {
      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'execute-test');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: execute-test
description: Skill for execution test
---

# Execution Test Skill

Follow these instructions carefully.
`,
      );

      await skillsService.discover(tempDir);

      const toolRegistry = new ToolRegistry({ enableSkills: true });
      toolRegistry.setSkillProvider(skillsService);

      const results = await toolRegistry.executeToolCalls([
        {
          id: 'test-1',
          name: 'skill',
          parameters: { name: 'execute-test' },
        },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('success');
      expect(results[0].result).toContain('## Skill: execute-test');
      expect(results[0].result).toContain('**Base directory**:');
      expect(results[0].result).toContain('# Execution Test Skill');
    });

    it('should return error for non-existent skill', async () => {
      await skillsService.discover(tempDir);

      const toolRegistry = new ToolRegistry({ enableSkills: true });
      toolRegistry.setSkillProvider(skillsService);

      const results = await toolRegistry.executeToolCalls([
        {
          id: 'test-2',
          name: 'skill',
          parameters: { name: 'does-not-exist' },
        },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('error');
      expect(results[0].result).toContain('not found');
    });

    it('should respect skill permissions', async () => {
      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'denied-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: denied-skill
description: A denied skill
---

Secret content
`,
      );

      skillsService.setConfig({ permissions: { 'denied-skill': 'deny' } });
      await skillsService.discover(tempDir);

      const toolRegistry = new ToolRegistry({ enableSkills: true });
      toolRegistry.setSkillProvider(skillsService);

      const results = await toolRegistry.executeToolCalls([
        {
          id: 'test-3',
          name: 'skill',
          parameters: { name: 'denied-skill' },
        },
      ]);

      expect(results).toHaveLength(1);
      expect(results[0].status).toBe('error');
      expect(results[0].result).toContain('not permitted');
    });

    it('should update tool description when skills change', async () => {
      await skillsService.discover(tempDir);

      const toolRegistry = new ToolRegistry({ enableSkills: true });
      toolRegistry.setSkillProvider(skillsService);

      let definitions = toolRegistry.getToolDefinitions(['skill']);
      expect(definitions[0].function.description).toContain('No skills are currently available');

      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'new-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: new-skill
description: A newly added skill
---

Content
`,
      );

      skillsService.reset();
      await skillsService.discover(tempDir);
      toolRegistry.updateSkillToolDescription();

      definitions = toolRegistry.getToolDefinitions(['skill']);
      expect(definitions[0].function.description).toContain('<name>new-skill</name>');
    });
  });

  describe('Claude Code compatibility', () => {
    it('should discover skills from .claude/skills directory', async () => {
      const skillDir = path.join(tempDir, '.claude', 'skills', 'claude-compat');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: claude-compat
description: Claude Code compatible skill
---

Works with both Nuvin and Claude Code.
`,
      );

      await skillsService.discover(tempDir);

      const skill = await skillsService.get('claude-compat');
      expect(skill).not.toBeNull();
      expect(skill?.name).toBe('claude-compat');
    });
  });

  describe('Configuration', () => {
    it('should respect enabled=false configuration', async () => {
      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'disabled-test');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: disabled-test
description: Should not be discovered
---
`,
      );

      const toolRegistry = new ToolRegistry({ enableSkills: false });

      const definitions = toolRegistry.getToolDefinitions(['skill']);
      expect(definitions).toHaveLength(0);
    });

    it('should discover skills from custom directories', async () => {
      const customDir = path.join(tempDir, 'my-custom-skills', 'custom-skill');
      await fs.mkdir(customDir, { recursive: true });
      await fs.writeFile(
        path.join(customDir, 'SKILL.md'),
        `---
name: custom-skill
description: From custom directory
---
`,
      );

      skillsService.setConfig({
        directories: [path.join(tempDir, 'my-custom-skills')],
      });
      await skillsService.discover(tempDir);

      const skill = await skillsService.get('custom-skill');
      expect(skill).not.toBeNull();
    });

    it('should exclude skills in exclude list', async () => {
      const skill1Dir = path.join(tempDir, '.nuvin', 'skills', 'included');
      const skill2Dir = path.join(tempDir, '.nuvin', 'skills', 'excluded');
      await fs.mkdir(skill1Dir, { recursive: true });
      await fs.mkdir(skill2Dir, { recursive: true });

      await fs.writeFile(
        path.join(skill1Dir, 'SKILL.md'),
        `---
name: included
description: Should be included
---
`,
      );
      await fs.writeFile(
        path.join(skill2Dir, 'SKILL.md'),
        `---
name: excluded
description: Should be excluded
---
`,
      );

      skillsService.setConfig({ exclude: ['excluded'] });
      await skillsService.discover(tempDir);

      expect(await skillsService.get('included')).not.toBeNull();
      expect(await skillsService.get('excluded')).toBeNull();
    });
  });
});
