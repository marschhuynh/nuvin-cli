import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MemoryService } from '../source/services/MemoryService.js';

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function removeTempDir(dir: string): Promise<void> {
  await fs.promises.rm(dir, { recursive: true, force: true });
}

describe('MemoryService (frontmatter + bm25)', () => {
  let globalDir: string;
  let projectDir: string;
  let service: MemoryService;

  beforeEach(() => {
    globalDir = makeTempDir('nuvin-mem-global-');
    projectDir = makeTempDir('nuvin-mem-project-');
    service = new MemoryService({
      globalDir,
      projectDir,
      workspaceId: 'ws_current',
      candidateLimit: 20,
      maxInjectionTokens: 200,
    });
  });

  afterEach(async () => {
    await removeTempDir(globalDir);
    await removeTempDir(projectDir);
  });

  it('writes one topic file per memory with yaml frontmatter', async () => {
    const entry = await service.upsertTopicMemory({
      topic: 'typescript-formatting',
      title: 'TypeScript Formatting Preferences',
      content: '- Prefer single quotes.',
      type: 'semantic',
      scope: 'project',
      source: 'explicit',
      keywords: ['typescript', 'formatting'],
    });

    expect(entry.topic).toBe('typescript-formatting');
    expect(entry.keywords).toContain('typescript');

    const file = path.join(projectDir, 'project', 'topics', 'typescript-formatting.md');
    expect(fs.existsSync(file)).toBe(true);
    const text = await fs.promises.readFile(file, 'utf-8');
    expect(text.startsWith('---\n')).toBe(true);
    expect(text).toContain('topic: typescript-formatting');
    expect(text).toContain('- Prefer single quotes.');
  });

  it('updates existing topic by merging content by default', async () => {
    await service.upsertTopicMemory({
      topic: 'lint-rules',
      content: '- Use single quotes.',
      type: 'procedural',
      scope: 'project',
      source: 'explicit',
      keywords: ['lint'],
    });

    const updated = await service.upsertTopicMemory({
      topic: 'lint-rules',
      content: '- Use single quotes.\n- Use 2 spaces.',
      type: 'procedural',
      scope: 'project',
      source: 'explicit',
      keywords: ['lint', 'spaces'],
    });

    expect(updated.content).toContain('- Use single quotes.');
    expect(updated.content).toContain('- Use 2 spaces.');
    expect(updated.content.match(/single quotes/gi)?.length).toBe(1);
  });

  it('supports replace mode when updating topic memory', async () => {
    await service.upsertTopicMemory({
      topic: 'code-style',
      content: '- Initial style',
      type: 'procedural',
      scope: 'project',
      source: 'explicit',
      keywords: ['style'],
    });

    const updated = await service.upsertTopicMemory({
      topic: 'code-style',
      content: '- New style only',
      type: 'procedural',
      scope: 'project',
      source: 'explicit',
      keywords: ['style'],
      updateMode: 'replace',
    });

    expect(updated.content).toContain('- New style only');
    expect(updated.content).not.toContain('- Initial style');
  });

  it('retrieves bm25-ranked memories for query', async () => {
    await service.upsertTopicMemory({
      topic: 'typescript-formatting',
      content: '- Prefer TypeScript strict mode and single quotes.',
      type: 'semantic',
      scope: 'project',
      source: 'explicit',
      keywords: ['typescript', 'strict', 'quotes'],
    });

    await service.upsertTopicMemory({
      topic: 'docker-notes',
      content: '- Docker compose command for local services.',
      type: 'episodic',
      scope: 'project',
      source: 'explicit',
      keywords: ['docker', 'compose'],
    });

    const found = await service.searchMemories({
      query: 'typescript strict quotes',
      workspaceId: 'ws_current',
    });

    expect(found.length).toBeGreaterThan(0);
    expect(found[0]?.topic).toBe('typescript-formatting');
  });

  it('enforces scope retrieval to global + current workspace', async () => {
    await service.upsertTopicMemory({
      topic: 'project-current',
      content: '- Current workspace convention.',
      type: 'semantic',
      scope: 'project',
      source: 'explicit',
      keywords: ['workspace'],
      workspaceId: 'ws_current',
    });

    await service.upsertTopicMemory({
      topic: 'project-other',
      content: '- Other workspace convention.',
      type: 'semantic',
      scope: 'project',
      source: 'explicit',
      keywords: ['workspace'],
      workspaceId: 'ws_other',
    });

    const found = await service.searchMemories({
      query: 'workspace convention',
      workspaceId: 'ws_current',
      scopes: ['project'],
    });

    const topics = found.map((entry) => entry.topic);
    expect(topics).toContain('project-current');
    expect(topics).not.toContain('project-other');
  });

  it('prefers project memory over global memory for same topic', async () => {
    await service.upsertTopicMemory({
      topic: 'typescript-formatting',
      content: '- Global: use double quotes.',
      type: 'semantic',
      scope: 'global',
      source: 'explicit',
      keywords: ['typescript', 'quotes'],
    });
    await service.upsertTopicMemory({
      topic: 'typescript-formatting',
      content: '- Project: use single quotes.',
      type: 'semantic',
      scope: 'project',
      source: 'explicit',
      keywords: ['typescript', 'quotes'],
      workspaceId: 'ws_current',
    });

    const found = await service.searchMemories({
      query: 'typescript quotes',
      workspaceId: 'ws_current',
    });
    const tsEntry = found.find((entry) => entry.topic === 'typescript-formatting');
    expect(tsEntry?.scope).toBe('project');
    expect(tsEntry?.content).toContain('single quotes');
  });

  it('builds memory injection within token budget', async () => {
    await service.upsertTopicMemory({
      topic: 'a',
      content: '- one two three four five six seven eight nine ten eleven twelve',
      type: 'semantic',
      scope: 'project',
      source: 'explicit',
      keywords: ['one'],
      workspaceId: 'ws_current',
    });
    await service.upsertTopicMemory({
      topic: 'b',
      content: '- alpha beta gamma delta epsilon zeta eta theta iota kappa lambda',
      type: 'semantic',
      scope: 'project',
      source: 'explicit',
      keywords: ['alpha'],
      workspaceId: 'ws_current',
    });

    const injection = await service.buildMemoryInjection({
      query: 'one alpha',
      workspaceId: 'ws_current',
      injectTokenBudget: 30,
      candidateLimit: 10,
    });

    expect(injection).toContain('## Facts & Preferences');
    const lineCount = injection.split('\n').filter((line) => line.startsWith('- ')).length;
    expect(lineCount).toBeLessThanOrEqual(1);
  });

  it('migrates legacy memories.json into topic markdown files', async () => {
    const legacyFile = path.join(globalDir, 'memories.json');
    const now = new Date().toISOString();
    await fs.promises.writeFile(
      legacyFile,
      JSON.stringify(
        [
          {
            id: 'mem_old_1',
            content: 'User prefers TypeScript strict mode',
            type: 'semantic',
            scope: 'global',
            tags: ['typescript', 'strict'],
            createdAt: now,
            updatedAt: now,
            accessCount: 0,
            lastAccessedAt: now,
            source: 'imported',
          },
        ],
        null,
        2,
      ),
      'utf-8',
    );

    const migratedService = new MemoryService({ globalDir, workspaceId: 'ws_current' });
    const all = await migratedService.getAllMemories();

    expect(all).toHaveLength(1);
    expect(all[0]?.topic).toBe('typescript-strict');
    const topicFile = path.join(globalDir, 'global', 'topics', 'typescript-strict.md');
    expect(fs.existsSync(topicFile)).toBe(true);
    const backups = (await fs.promises.readdir(globalDir)).filter((file) => file.startsWith('memories.json.bak.'));
    expect(backups.length).toBeGreaterThan(0);
  });

  it('writes v2 statement metadata and renders active statements into markdown body', async () => {
    await service.upsertTopicMemory({
      topic: 'team-style',
      content: 'Prefer pnpm for scripts',
      type: 'procedural',
      scope: 'project',
      source: 'explicit',
      key: 'tooling.package-manager',
      confidence: 0.9,
      evidence: ['User instruction in planning session'],
      keywords: ['pnpm', 'scripts'],
      workspaceId: 'ws_current',
    });

    const file = path.join(projectDir, 'project', 'topics', 'team-style.md');
    const text = await fs.promises.readFile(file, 'utf-8');

    expect(text).toContain('version: 2');
    expect(text).toContain('statements:');
    expect(text).toContain('tooling.package-manager');
    expect(text).toContain('- Prefer pnpm for scripts');
  });

  it('suppresses superseded statements during injection and keeps only newest active key', async () => {
    await service.upsertTopicMemory({
      topic: 'style',
      content: 'Use double quotes',
      type: 'procedural',
      scope: 'project',
      source: 'explicit',
      key: 'style.quotes',
      confidence: 0.4,
      workspaceId: 'ws_current',
    });

    await service.upsertTopicMemory({
      topic: 'style',
      content: 'Use single quotes',
      type: 'procedural',
      scope: 'project',
      source: 'explicit',
      key: 'style.quotes',
      confidence: 0.9,
      workspaceId: 'ws_current',
    });

    const injection = await service.buildMemoryInjection({
      query: 'quotes style',
      workspaceId: 'ws_current',
      injectTokenBudget: 200,
      candidateLimit: 10,
    });

    expect(injection).toContain('single quotes');
    expect(injection).not.toContain('double quotes');
  });

  it('returns structured statement hits from queryStatements with score metadata', async () => {
    await service.upsertTopicMemory({
      topic: 'style-global',
      content: 'Use double quotes',
      type: 'procedural',
      scope: 'global',
      source: 'explicit',
      key: 'style.quotes',
    });

    await service.upsertTopicMemory({
      topic: 'style-project',
      content: 'Use single quotes',
      type: 'procedural',
      scope: 'project',
      source: 'explicit',
      key: 'style.quotes',
      workspaceId: 'ws_current',
    });

    const hits = await service.queryStatements({
      query: 'quotes style',
      workspaceId: 'ws_current',
      candidateLimit: 5,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.scope).toBe('project');
    expect(hits[0]?.statementId).toBeDefined();
    expect(typeof hits[0]?.score).toBe('number');
  });

  it('builds compact core memory injection independent from user query', async () => {
    await service.upsertTopicMemory({
      topic: 'pkg-manager',
      content: 'Use pnpm for scripts',
      type: 'procedural',
      scope: 'project',
      source: 'explicit',
      key: 'tooling.package-manager',
      workspaceId: 'ws_current',
    });

    await service.upsertTopicMemory({
      topic: 'incident',
      content: 'We once hit a flaky CI timeout',
      type: 'episodic',
      scope: 'project',
      source: 'explicit',
      workspaceId: 'ws_current',
    });

    const core = await service.buildCoreMemoryInjection({
      workspaceId: 'ws_current',
      injectTokenBudget: 120,
      candidateLimit: 6,
    });

    expect(core).toContain('## Behavioral Notes');
    expect(core).toContain('Use pnpm for scripts');
    expect(core).not.toContain('flaky CI timeout');
  });

  it('migrates v1 topic files to v2 and creates backups', async () => {
    const topicsDir = path.join(globalDir, 'global', 'topics');
    await fs.promises.mkdir(topicsDir, { recursive: true });
    const legacyTopicPath = path.join(topicsDir, 'legacy-topic.md');
    const now = new Date().toISOString();
    await fs.promises.writeFile(
      legacyTopicPath,
      `---\nid: mem_legacy\ntopic: legacy-topic\nscope: global\ntype: semantic\nkeywords: [legacy]\ntags: [legacy]\ncreatedAt: ${now}\nupdatedAt: ${now}\naccessCount: 0\nlastAccessedAt: ${now}\nsource: imported\nversion: 1\n---\n\n- Legacy memory line\n`,
      'utf-8',
    );

    const migrationResult = await service.migrateV1ToV2();
    expect(migrationResult.migratedCount).toBeGreaterThanOrEqual(0);
    expect(migrationResult.backupsCreated).toBeGreaterThanOrEqual(0);

    const migratedText = await fs.promises.readFile(legacyTopicPath, 'utf-8');
    expect(migratedText).toContain('version: 2');
    expect(migratedText).toContain('statements:');

    const files = await fs.promises.readdir(topicsDir);
    expect(files.some((file) => file.includes('.v1.bak.'))).toBe(true);
  });

  it('returns migration status for memory ui/reporting', async () => {
    const status = await service.getMigrationStatus();
    expect(status.currentVersion).toBe(2);
    expect(typeof status.lastRunAt).toBe('string');
  });
});
