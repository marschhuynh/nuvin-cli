import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CommandFilePersistence } from '../command-file-persistence.js';
import type { CustomCommandTemplate } from '../command-types.js';

describe('CommandFilePersistence', () => {
  let tempDir: string;
  let globalDir: string;
  let profileDir: string;
  let localDir: string;
  let persistence: CommandFilePersistence;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'command-test-'));
    globalDir = path.join(tempDir, 'global', 'commands');
    profileDir = path.join(tempDir, 'profile', 'commands');
    localDir = path.join(tempDir, 'local', 'commands');

    persistence = new CommandFilePersistence({
      globalDir,
      profileDir,
      localDir,
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('save', () => {
    it('should save a command to the correct directory', async () => {
      const command: CustomCommandTemplate = {
        id: 'test-cmd',
        description: 'A test command',
        prompt: 'Test prompt with {{user_prompt}}',
        source: 'global',
      };

      await persistence.save(command);

      const filePath = path.join(globalDir, 'test-cmd.md');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('description: A test command');
      expect(content).toContain('Test prompt with {{user_prompt}}');
    });

    it('should save to profile directory', async () => {
      const command: CustomCommandTemplate = {
        id: 'profile-cmd',
        description: 'Profile command',
        prompt: 'Profile prompt',
        source: 'profile',
      };

      await persistence.save(command);

      const filePath = path.join(profileDir, 'profile-cmd.md');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should save to local directory', async () => {
      const command: CustomCommandTemplate = {
        id: 'local-cmd',
        description: 'Local command',
        prompt: 'Local prompt',
        source: 'local',
      };

      await persistence.save(command);

      const filePath = path.join(localDir, 'local-cmd.md');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('should include enabled:false in frontmatter when disabled', async () => {
      const command: CustomCommandTemplate = {
        id: 'disabled-cmd',
        description: 'Disabled command',
        prompt: 'Prompt',
        source: 'global',
        enabled: false,
      };

      await persistence.save(command);

      const filePath = path.join(globalDir, 'disabled-cmd.md');
      const content = fs.readFileSync(filePath, 'utf8');
      expect(content).toContain('enabled: false');
    });
  });

  describe('load', () => {
    it('should load a command from file', async () => {
      const mdContent = `---
description: Test description
---

Test prompt content`;

      fs.mkdirSync(globalDir, { recursive: true });
      fs.writeFileSync(path.join(globalDir, 'my-cmd.md'), mdContent);

      const loaded = await persistence.load('my-cmd.md', 'global');

      expect(loaded).not.toBeNull();
      expect(loaded?.id).toBe('my-cmd');
      expect(loaded?.description).toBe('Test description');
      expect(loaded?.prompt).toBe('Test prompt content');
      expect(loaded?.source).toBe('global');
      expect(loaded?.enabled).toBe(true);
    });

    it('should load disabled command', async () => {
      const mdContent = `---
description: Disabled test
enabled: false
---

Prompt`;

      fs.mkdirSync(globalDir, { recursive: true });
      fs.writeFileSync(path.join(globalDir, 'disabled.md'), mdContent);

      const loaded = await persistence.load('disabled.md', 'global');

      expect(loaded?.enabled).toBe(false);
    });

    it('should return null for invalid file', async () => {
      const mdContent = `---
no_description: here
---

Prompt`;

      fs.mkdirSync(globalDir, { recursive: true });
      fs.writeFileSync(path.join(globalDir, 'invalid.md'), mdContent);

      const loaded = await persistence.load('invalid.md', 'global');
      expect(loaded).toBeNull();
    });
  });

  describe('loadAll', () => {
    it('should load commands from all directories', async () => {
      fs.mkdirSync(globalDir, { recursive: true });
      fs.mkdirSync(profileDir, { recursive: true });
      fs.mkdirSync(localDir, { recursive: true });

      fs.writeFileSync(path.join(globalDir, 'global-cmd.md'), `---
description: Global cmd
---

Global prompt`);

      fs.writeFileSync(path.join(profileDir, 'profile-cmd.md'), `---
description: Profile cmd
---

Profile prompt`);

      fs.writeFileSync(path.join(localDir, 'local-cmd.md'), `---
description: Local cmd
---

Local prompt`);

      const commands = await persistence.loadAll();

      expect(commands.length).toBe(3);
      expect(commands.find(c => c.id === 'global-cmd')).toBeDefined();
      expect(commands.find(c => c.id === 'profile-cmd')).toBeDefined();
      expect(commands.find(c => c.id === 'local-cmd')).toBeDefined();
    });

    it('should work when directories do not exist', async () => {
      const commands = await persistence.loadAll();
      expect(commands).toEqual([]);
    });
  });

  describe('delete', () => {
    it('should delete a command file', async () => {
      fs.mkdirSync(globalDir, { recursive: true });
      const filePath = path.join(globalDir, 'to-delete.md');
      fs.writeFileSync(filePath, `---
description: To delete
---

Prompt`);

      expect(fs.existsSync(filePath)).toBe(true);

      await persistence.delete('to-delete', 'global');

      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('should not throw when file does not exist', async () => {
      await expect(persistence.delete('non-existent', 'global')).resolves.not.toThrow();
    });
  });

  describe('exists', () => {
    it('should return true when file exists', async () => {
      fs.mkdirSync(globalDir, { recursive: true });
      fs.writeFileSync(path.join(globalDir, 'exists-cmd.md'), `---
description: Exists
---

Prompt`);

      expect(persistence.exists('exists-cmd', 'global')).toBe(true);
    });

    it('should return false when file does not exist', () => {
      expect(persistence.exists('non-existent', 'global')).toBe(false);
    });
  });

  describe('setProfileDir', () => {
    it('should update profile directory', async () => {
      const newProfileDir = path.join(tempDir, 'new-profile', 'commands');
      persistence.setProfileDir(newProfileDir);

      const command: CustomCommandTemplate = {
        id: 'new-profile-cmd',
        description: 'New profile command',
        prompt: 'Prompt',
        source: 'profile',
      };

      await persistence.save(command);

      expect(fs.existsSync(path.join(newProfileDir, 'new-profile-cmd.md'))).toBe(true);
    });

    it('should handle undefined profile dir', () => {
      persistence.setProfileDir(undefined);

      expect(() => persistence.getDir('profile')).toThrow('Profile directory not set');
    });
  });
});
