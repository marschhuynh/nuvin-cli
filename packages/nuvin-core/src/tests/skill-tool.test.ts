import { describe, it, expect, beforeEach } from 'vitest';
import { SkillTool, type SkillProvider, type SkillInfo } from '../tools/SkillTool.js';

class MockSkillProvider implements SkillProvider {
  private skills: Record<string, SkillInfo> = {};
  private fileContents: Record<string, string> = {};

  addSkill(skill: SkillInfo, content: string) {
    this.skills[skill.name] = skill;
    this.fileContents[skill.location] = content;
  }

  async get(name: string): Promise<SkillInfo | null> {
    return this.skills[name] ?? null;
  }

  async getAll(): Promise<Record<string, SkillInfo>> {
    return { ...this.skills };
  }

  buildToolDescription(): string {
    const skillList = Object.values(this.skills);
    if (skillList.length === 0) {
      return 'Load a skill to get detailed instructions. No skills available.';
    }

    const lines = [
      'Load a skill to get detailed instructions for a specific task.',
    ];

    for (const skill of skillList) {
      lines.push(`- ${skill.name}: ${skill.description}`);
    }

    return lines.join('\n');
  }

  getFileContent(location: string): string | undefined {
    return this.fileContents[location];
  }
}

describe('SkillTool', () => {
  let skillTool: SkillTool;
  let mockProvider: MockSkillProvider;

  beforeEach(() => {
    skillTool = new SkillTool();
    mockProvider = new MockSkillProvider();
  });

  describe('definition', () => {
    it('should return default description without provider', () => {
      const def = skillTool.definition();
      expect(def.name).toBe('skill');
      expect(def.description).toContain('No skills available');
    });

    it('should return dynamic description with provider', () => {
      mockProvider.addSkill(
        { name: 'test-skill', description: 'A test skill', location: '/path/to/skill/SKILL.md' },
        '---\nname: test-skill\ndescription: A test skill\n---\n\n# Test',
      );
      skillTool.setProvider(mockProvider);

      const def = skillTool.definition();
      expect(def.description).toContain('- test-skill: A test skill');
    });
  });

  describe('execute', () => {
    it('should return error without provider', async () => {
      const result = await skillTool.execute({ name: 'any-skill' });

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.result).toContain('Skill provider not configured');
      }
    });

    it('should return error for empty name', async () => {
      skillTool.setProvider(mockProvider);
      const result = await skillTool.execute({ name: '' });

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.result).toContain('must be a non-empty string');
      }
    });

    it('should return error for non-existent skill', async () => {
      skillTool.setProvider(mockProvider);
      const result = await skillTool.execute({ name: 'non-existent' });

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.result).toContain('not found');
        expect(result.result).toContain('Available skills: none');
      }
    });

    it('should list available skills when skill not found', async () => {
      mockProvider.addSkill(
        { name: 'skill-a', description: 'Skill A', location: '/a/SKILL.md' },
        '---\nname: skill-a\ndescription: Skill A\n---\n',
      );
      mockProvider.addSkill(
        { name: 'skill-b', description: 'Skill B', location: '/b/SKILL.md' },
        '---\nname: skill-b\ndescription: Skill B\n---\n',
      );
      skillTool.setProvider(mockProvider);

      const result = await skillTool.execute({ name: 'non-existent' });

      expect(result.status).toBe('error');
      if (result.status === 'error') {
        expect(result.result).toContain('skill-a');
        expect(result.result).toContain('skill-b');
      }
    });
  });

  describe('updateDescription', () => {
    it('should update description when skills change', () => {
      skillTool.setProvider(mockProvider);
      const def1 = skillTool.definition();
      expect(def1.description).toContain('No skills available');

      mockProvider.addSkill(
        { name: 'new-skill', description: 'New skill', location: '/new/SKILL.md' },
        '---\nname: new-skill\ndescription: New skill\n---\n',
      );
      skillTool.updateDescription();

      const def2 = skillTool.definition();
      expect(def2.description).toContain('- new-skill:');
    });
  });
});
