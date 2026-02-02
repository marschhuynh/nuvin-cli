import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SkillsService } from '../source/services/SkillsService.js';

describe('Skills Discovery - Global and Local', () => {
  let tempDir: string;
  let fakeHomeDir: string;
  let skillsService: SkillsService;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-local-'));
    fakeHomeDir = await fs.mkdtemp(path.join(os.tmpdir(), 'skills-global-'));

    SkillsService.resetInstance();
    skillsService = SkillsService.createWithHomeDir(fakeHomeDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    await fs.rm(fakeHomeDir, { recursive: true, force: true });
  });

  describe('Local skills (.nuvin/skills)', () => {
    it('should discover skills from project .nuvin/skills directory', async () => {
      const skillDir = path.join(tempDir, '.nuvin', 'skills', 'local-nuvin-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: local-nuvin-skill
description: A local Nuvin skill in project directory
---

# Local Nuvin Skill

Project-specific instructions.
`,
      );

      const result = await skillsService.discover(tempDir);

      expect(result.skills['local-nuvin-skill']).toBeDefined();
      expect(result.skills['local-nuvin-skill'].description).toBe('A local Nuvin skill in project directory');
      expect(result.skills['local-nuvin-skill'].location).toContain('.nuvin/skills');
    });
  });

  describe('Local skills (.claude/skills)', () => {
    it('should discover skills from project .claude/skills directory', async () => {
      const skillDir = path.join(tempDir, '.claude', 'skills', 'local-claude-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: local-claude-skill
description: A local Claude Code skill in project directory
---

# Local Claude Skill

Claude Code compatible.
`,
      );

      const result = await skillsService.discover(tempDir);

      expect(result.skills['local-claude-skill']).toBeDefined();
      expect(result.skills['local-claude-skill'].description).toBe('A local Claude Code skill in project directory');
      expect(result.skills['local-claude-skill'].location).toContain('.claude/skills');
    });
  });

  describe('Global skills (~/.nuvin/skills)', () => {
    it('should discover skills from global ~/.nuvin/skills directory', async () => {
      const skillDir = path.join(fakeHomeDir, '.nuvin', 'skills', 'global-nuvin-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: global-nuvin-skill
description: A global Nuvin skill in home directory
---

# Global Nuvin Skill

Available across all projects.
`,
      );

      const result = await skillsService.discover(tempDir);

      expect(result.skills['global-nuvin-skill']).toBeDefined();
      expect(result.skills['global-nuvin-skill'].description).toBe('A global Nuvin skill in home directory');
      expect(result.skills['global-nuvin-skill'].location).toContain(fakeHomeDir);
    });
  });

  describe('Global skills (~/.claude/skills)', () => {
    it('should discover skills from global ~/.claude/skills directory', async () => {
      const skillDir = path.join(fakeHomeDir, '.claude', 'skills', 'global-claude-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: global-claude-skill
description: A global Claude Code skill in home directory
---

# Global Claude Skill

Claude Code compatible, global.
`,
      );

      const result = await skillsService.discover(tempDir);

      expect(result.skills['global-claude-skill']).toBeDefined();
      expect(result.skills['global-claude-skill'].description).toBe('A global Claude Code skill in home directory');
      expect(result.skills['global-claude-skill'].location).toContain(fakeHomeDir);
    });
  });

  describe('Combined local and global discovery', () => {
    it('should discover skills from all four directories simultaneously', async () => {
      const localNuvinDir = path.join(tempDir, '.nuvin', 'skills', 'local-nuvin');
      const localClaudeDir = path.join(tempDir, '.claude', 'skills', 'local-claude');
      const globalNuvinDir = path.join(fakeHomeDir, '.nuvin', 'skills', 'global-nuvin');
      const globalClaudeDir = path.join(fakeHomeDir, '.claude', 'skills', 'global-claude');

      await fs.mkdir(localNuvinDir, { recursive: true });
      await fs.mkdir(localClaudeDir, { recursive: true });
      await fs.mkdir(globalNuvinDir, { recursive: true });
      await fs.mkdir(globalClaudeDir, { recursive: true });

      await fs.writeFile(
        path.join(localNuvinDir, 'SKILL.md'),
        `---
name: local-nuvin
description: Local Nuvin skill
---
`,
      );
      await fs.writeFile(
        path.join(localClaudeDir, 'SKILL.md'),
        `---
name: local-claude
description: Local Claude skill
---
`,
      );
      await fs.writeFile(
        path.join(globalNuvinDir, 'SKILL.md'),
        `---
name: global-nuvin
description: Global Nuvin skill
---
`,
      );
      await fs.writeFile(
        path.join(globalClaudeDir, 'SKILL.md'),
        `---
name: global-claude
description: Global Claude skill
---
`,
      );

      const result = await skillsService.discover(tempDir);

      expect(Object.keys(result.skills)).toHaveLength(4);
      expect(result.skills['local-nuvin']).toBeDefined();
      expect(result.skills['local-claude']).toBeDefined();
      expect(result.skills['global-nuvin']).toBeDefined();
      expect(result.skills['global-claude']).toBeDefined();
    });

    it('should give priority to first discovered skill (local over global with same name)', async () => {
      const localDir = path.join(tempDir, '.claude', 'skills', 'same-name');
      const globalDir = path.join(fakeHomeDir, '.claude', 'skills', 'same-name');

      await fs.mkdir(localDir, { recursive: true });
      await fs.mkdir(globalDir, { recursive: true });

      await fs.writeFile(
        path.join(localDir, 'SKILL.md'),
        `---
name: same-name
description: Local version takes priority
---
`,
      );
      await fs.writeFile(
        path.join(globalDir, 'SKILL.md'),
        `---
name: same-name
description: Global version should be ignored
---
`,
      );

      const result = await skillsService.discover(tempDir);

      expect(Object.keys(result.skills)).toHaveLength(1);
      expect(result.skills['same-name'].description).toBe('Local version takes priority');
      expect(result.skills['same-name'].location).toContain(tempDir);
    });
  });

  describe('NUVIN_SKILLS_PATH environment variable', () => {
    it('should discover skills from NUVIN_SKILLS_PATH directories', async () => {
      const envSkillsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'env-skills-'));
      const skillDir = path.join(envSkillsDir, 'env-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: env-skill
description: Skill from NUVIN_SKILLS_PATH
---
`,
      );

      const originalEnv = process.env.NUVIN_SKILLS_PATH;
      process.env.NUVIN_SKILLS_PATH = envSkillsDir;

      try {
        const result = await skillsService.discover(tempDir);
        expect(result.skills['env-skill']).toBeDefined();
        expect(result.skills['env-skill'].description).toBe('Skill from NUVIN_SKILLS_PATH');
      } finally {
        if (originalEnv === undefined) {
          delete process.env.NUVIN_SKILLS_PATH;
        } else {
          process.env.NUVIN_SKILLS_PATH = originalEnv;
        }
        await fs.rm(envSkillsDir, { recursive: true, force: true });
      }
    });

    it('should support multiple paths in NUVIN_SKILLS_PATH', async () => {
      const envDir1 = await fs.mkdtemp(path.join(os.tmpdir(), 'env-skills-1-'));
      const envDir2 = await fs.mkdtemp(path.join(os.tmpdir(), 'env-skills-2-'));

      const skill1Dir = path.join(envDir1, 'env-skill-one');
      const skill2Dir = path.join(envDir2, 'env-skill-two');
      await fs.mkdir(skill1Dir, { recursive: true });
      await fs.mkdir(skill2Dir, { recursive: true });

      await fs.writeFile(
        path.join(skill1Dir, 'SKILL.md'),
        `---
name: env-skill-one
description: First env skill
---
`,
      );
      await fs.writeFile(
        path.join(skill2Dir, 'SKILL.md'),
        `---
name: env-skill-two
description: Second env skill
---
`,
      );

      const originalEnv = process.env.NUVIN_SKILLS_PATH;
      process.env.NUVIN_SKILLS_PATH = `${envDir1}${path.delimiter}${envDir2}`;

      try {
        const result = await skillsService.discover(tempDir);
        expect(result.skills['env-skill-one']).toBeDefined();
        expect(result.skills['env-skill-two']).toBeDefined();
      } finally {
        if (originalEnv === undefined) {
          delete process.env.NUVIN_SKILLS_PATH;
        } else {
          process.env.NUVIN_SKILLS_PATH = originalEnv;
        }
        await fs.rm(envDir1, { recursive: true, force: true });
        await fs.rm(envDir2, { recursive: true, force: true });
      }
    });
  });

  describe('Custom directories config', () => {
    it('should discover skills from custom directories with ~ expansion', async () => {
      const customDir = path.join(fakeHomeDir, 'my-skills', 'custom-skill');
      await fs.mkdir(customDir, { recursive: true });
      await fs.writeFile(
        path.join(customDir, 'SKILL.md'),
        `---
name: custom-skill
description: Skill from custom directory with tilde
---
`,
      );

      skillsService.setConfig({
        directories: ['~/my-skills'],
      });

      const result = await skillsService.discover(tempDir);

      expect(result.skills['custom-skill']).toBeDefined();
      expect(result.skills['custom-skill'].location).toContain(fakeHomeDir);
    });

    it('should discover skills from relative custom directories', async () => {
      const customDir = path.join(tempDir, 'custom-skills', 'relative-skill');
      await fs.mkdir(customDir, { recursive: true });
      await fs.writeFile(
        path.join(customDir, 'SKILL.md'),
        `---
name: relative-skill
description: Skill from relative custom directory
---
`,
      );

      skillsService.setConfig({
        directories: ['custom-skills'],
      });

      const result = await skillsService.discover(tempDir);

      expect(result.skills['relative-skill']).toBeDefined();
    });

    it('should discover skills from absolute custom directories', async () => {
      const absoluteDir = await fs.mkdtemp(path.join(os.tmpdir(), 'absolute-skills-'));
      const skillDir = path.join(absoluteDir, 'absolute-skill');
      await fs.mkdir(skillDir, { recursive: true });
      await fs.writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---
name: absolute-skill
description: Skill from absolute custom directory
---
`,
      );

      skillsService.setConfig({
        directories: [absoluteDir],
      });

      try {
        const result = await skillsService.discover(tempDir);
        expect(result.skills['absolute-skill']).toBeDefined();
      } finally {
        await fs.rm(absoluteDir, { recursive: true, force: true });
      }
    });
  });
});
