import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { CustomCommandRegistry } from '../source/services/CustomCommandRegistry.js';
import type { CustomCommandTemplate } from '@nuvin/nuvin-core';

describe('CustomCommandRegistry', () => {
  let tempDir: string;
  let globalDir: string;
  let profileDir: string;
  let localDir: string;
  let registry: CustomCommandRegistry;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cmd-registry-test-'));
    globalDir = path.join(tempDir, 'global');
    profileDir = path.join(tempDir, 'profile');
    localDir = path.join(tempDir, 'local');

    registry = new CustomCommandRegistry({
      globalDir,
      profileDir,
      localDir,
      activeProfile: 'test-profile',
    });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('initialize', () => {
    it('should initialize with empty command list', async () => {
      await registry.initialize();
      const commands = registry.list();
      expect(commands).toEqual([]);
    });

    it('should load commands from all directories', async () => {
      const globalCmdDir = path.join(globalDir, 'commands');
      const profileCmdDir = path.join(profileDir, 'commands');
      const localCmdDir = path.join(localDir, 'commands');

      fs.mkdirSync(globalCmdDir, { recursive: true });
      fs.mkdirSync(profileCmdDir, { recursive: true });
      fs.mkdirSync(localCmdDir, { recursive: true });

      fs.writeFileSync(
        path.join(globalCmdDir, 'global-cmd.md'),
        `---
description: Global command
---

Global prompt`,
      );

      fs.writeFileSync(
        path.join(profileCmdDir, 'profile-cmd.md'),
        `---
description: Profile command
---

Profile prompt`,
      );

      fs.writeFileSync(
        path.join(localCmdDir, 'local-cmd.md'),
        `---
description: Local command
---

Local prompt`,
      );

      await registry.initialize();
      const commands = registry.list();

      expect(commands.length).toBe(3);
      expect(commands.find((c) => c.id === 'global-cmd')?.source).toBe('global');
      expect(commands.find((c) => c.id === 'profile-cmd')?.source).toBe('profile');
      expect(commands.find((c) => c.id === 'local-cmd')?.source).toBe('local');
    });
  });

  describe('priority and shadowing', () => {
    it('should prioritize local over profile over global', async () => {
      const globalCmdDir = path.join(globalDir, 'commands');
      const profileCmdDir = path.join(profileDir, 'commands');
      const localCmdDir = path.join(localDir, 'commands');

      fs.mkdirSync(globalCmdDir, { recursive: true });
      fs.mkdirSync(profileCmdDir, { recursive: true });
      fs.mkdirSync(localCmdDir, { recursive: true });

      fs.writeFileSync(
        path.join(globalCmdDir, 'review.md'),
        `---
description: Global review
---

Global review prompt`,
      );

      fs.writeFileSync(
        path.join(profileCmdDir, 'review.md'),
        `---
description: Profile review
---

Profile review prompt`,
      );

      fs.writeFileSync(
        path.join(localCmdDir, 'review.md'),
        `---
description: Local review
---

Local review prompt`,
      );

      await registry.initialize();

      const review = registry.get('review');
      expect(review?.source).toBe('local');
      expect(review?.description).toBe('Local review');
    });

    it('should track shadowed commands', async () => {
      const globalCmdDir = path.join(globalDir, 'commands');
      const localCmdDir = path.join(localDir, 'commands');

      fs.mkdirSync(globalCmdDir, { recursive: true });
      fs.mkdirSync(localCmdDir, { recursive: true });

      fs.writeFileSync(
        path.join(globalCmdDir, 'cmd.md'),
        `---
description: Global cmd
---

Global`,
      );

      fs.writeFileSync(
        path.join(localCmdDir, 'cmd.md'),
        `---
description: Local cmd
---

Local`,
      );

      await registry.initialize();

      const shadowed = registry.getShadowed('cmd');
      expect(shadowed.length).toBe(1);
      expect(shadowed[0]?.source).toBe('global');
    });
  });

  describe('CRUD operations', () => {
    it('should save and retrieve a command', async () => {
      await registry.initialize();

      const command: CustomCommandTemplate = {
        id: 'new-cmd',
        description: 'New command',
        prompt: 'New prompt {{user_prompt}}',
        source: 'local',
      };

      await registry.saveToFile({
        ...command,
        enabled: true,
        filePath: '',
      });

      const retrieved = registry.get('new-cmd');
      expect(retrieved).toBeDefined();
      expect(retrieved?.description).toBe('New command');
      expect(retrieved?.source).toBe('local');
    });

    it('should delete a command', async () => {
      const localCmdDir = path.join(localDir, 'commands');
      fs.mkdirSync(localCmdDir, { recursive: true });
      fs.writeFileSync(
        path.join(localCmdDir, 'to-delete.md'),
        `---
description: To delete
---

Prompt`,
      );

      await registry.initialize();
      expect(registry.exists('to-delete')).toBe(true);

      await registry.deleteFromFile('to-delete', 'local');
      expect(registry.exists('to-delete')).toBe(false);
    });

    it('should unregister specific source when multiple exist', async () => {
      const globalCmdDir = path.join(globalDir, 'commands');
      const localCmdDir = path.join(localDir, 'commands');

      fs.mkdirSync(globalCmdDir, { recursive: true });
      fs.mkdirSync(localCmdDir, { recursive: true });

      fs.writeFileSync(
        path.join(globalCmdDir, 'cmd.md'),
        `---
description: Global
---

Global`,
      );

      fs.writeFileSync(
        path.join(localCmdDir, 'cmd.md'),
        `---
description: Local
---

Local`,
      );

      await registry.initialize();

      expect(registry.get('cmd')?.source).toBe('local');

      await registry.deleteFromFile('cmd', 'local');

      expect(registry.exists('cmd')).toBe(true);
      expect(registry.get('cmd')?.source).toBe('global');
    });
  });

  describe('renderPrompt', () => {
    it('should replace {{user_prompt}} with user input', async () => {
      const localCmdDir = path.join(localDir, 'commands');
      fs.mkdirSync(localCmdDir, { recursive: true });
      fs.writeFileSync(
        path.join(localCmdDir, 'review.md'),
        `---
description: Review
---

Review the code:
{{user_prompt}}

Focus on best practices.`,
      );

      await registry.initialize();

      const rendered = registry.renderPrompt('review', 'check memory leaks');
      expect(rendered).toBe(`Review the code:
check memory leaks

Focus on best practices.`);
    });

    it('should replace multiple occurrences', async () => {
      const localCmdDir = path.join(localDir, 'commands');
      fs.mkdirSync(localCmdDir, { recursive: true });
      fs.writeFileSync(
        path.join(localCmdDir, 'multi.md'),
        `---
description: Multi
---

First: {{user_prompt}}
Second: {{user_prompt}}`,
      );

      await registry.initialize();

      const rendered = registry.renderPrompt('multi', 'test');
      expect(rendered).toBe(`First: test
Second: test`);
    });

    it('should return user prompt for non-existent command', async () => {
      await registry.initialize();
      const rendered = registry.renderPrompt('non-existent', 'test');
      expect(rendered).toBe('test');
    });
  });

  describe('getAvailableScopes', () => {
    it('should include profile when active', () => {
      const scopes = registry.getAvailableScopes();
      expect(scopes).toContain('global');
      expect(scopes).toContain('profile');
      expect(scopes).toContain('local');
    });

    it('should exclude profile when not active', () => {
      const noProfileRegistry = new CustomCommandRegistry({
        globalDir,
        localDir,
      });

      const scopes = noProfileRegistry.getAvailableScopes();
      expect(scopes).toContain('global');
      expect(scopes).not.toContain('profile');
      expect(scopes).toContain('local');
    });
  });

  describe('hasActiveProfile', () => {
    it('should return true when profile is set', () => {
      expect(registry.hasActiveProfile()).toBe(true);
    });

    it('should return false when no profile', () => {
      const noProfileRegistry = new CustomCommandRegistry({
        globalDir,
        localDir,
      });
      expect(noProfileRegistry.hasActiveProfile()).toBe(false);
    });

    it('should return false for default profile', () => {
      const defaultRegistry = new CustomCommandRegistry({
        globalDir,
        localDir,
        activeProfile: 'default',
      });
      expect(defaultRegistry.hasActiveProfile()).toBe(false);
    });
  });
});
