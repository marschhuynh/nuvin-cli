import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type {
  MemoryEntry,
  MemoryScope,
  MemorySource,
  MemoryStatement,
  MemoryStatus,
  MemoryType,
} from '@nuvin/nuvin-core';

interface MemoryServiceConfig {
  globalDir: string;
  projectDir?: string;
  workspaceId?: string;
  maxInjectionTokens?: number;
  coreInjectionTokens?: number;
  candidateLimit?: number;
  activeCandidateLimit?: number;
  indexPersisted?: boolean;
  minScore?: number;
  freshnessHalfLifeDays?: number;
  indexFlushIntervalMs?: number;
}

type TopicUpdateMode = 'merge' | 'replace';

type TopicMemoryInput = {
  content: string;
  type: MemoryType;
  scope: MemoryScope;
  source: MemorySource;
  topic?: string;
  key?: string;
  title?: string;
  tags?: string[];
  keywords?: string[];
  workspaceId?: string;
  confidence?: number;
  evidence?: string[];
  contradicts?: string[];
  updateMode?: TopicUpdateMode;
};

type SearchMemoryOptions = {
  query: string;
  workspaceId?: string;
  scopes?: MemoryScope[];
  candidateLimit?: number;
  minScore?: number;
};

type BuildMemoryInjectionOptions = {
  query: string;
  workspaceId?: string;
  injectTokenBudget?: number;
  candidateLimit?: number;
};

type BuildCoreMemoryInjectionOptions = {
  workspaceId?: string;
  injectTokenBudget?: number;
  candidateLimit?: number;
};

export type QueryStatementsOptions = {
  query: string;
  key?: string;
  workspaceId?: string;
  scopes?: MemoryScope[];
  candidateLimit?: number;
  minScore?: number;
};

type RankedStatementsOptions = {
  query: string;
  key?: string;
  workspaceId?: string;
  scopes?: MemoryScope[];
  candidateLimit?: number;
  minScore?: number;
  includeNonActive?: boolean;
  allowedTypes?: MemoryType[];
};

type RankedStatement = {
  entry: MemoryEntry;
  statement: MemoryStatement;
  score: number;
};

export type MemoryQueryHit = {
  id: string;
  statementId: string;
  key?: string;
  topic: string;
  scope: MemoryScope;
  type: MemoryType;
  content: string;
  score: number;
  confidence?: number;
  updatedAt: string;
};

type TopicFileDoc = {
  path: string;
  entry: MemoryEntry;
};

type IndexedStatementDoc = {
  id: string;
  topicSlug: string;
  entry: MemoryEntry;
  statement: MemoryStatement;
  docLen: number;
  terms: Record<string, number>;
};

type ScopeIndex = {
  version: 2;
  scope: MemoryScope;
  workspaceId?: string;
  docCount: number;
  avgDocLen: number;
  df: Record<string, number>;
  docs: Record<string, IndexedStatementDoc>;
  updatedAt: string;
};

type MigrationStatus = {
  currentVersion: 2;
  lastRunAt: string;
  migratedCount: number;
  backupsCreated: number;
  skippedCount: number;
  warnings: string[];
};

type AccessBufferItem = {
  scope: MemoryScope;
  topicSlug: string;
  statementId: string;
  count: number;
  lastAccessedAt: string;
};

const TYPE_WEIGHTS: Record<MemoryType, number> = {
  semantic: 0.6,
  episodic: 0.3,
  procedural: 0.1,
};

const DEFAULT_RECENCY_HALF_LIFE_DAYS = 7;
const MEMORY_FILE_REGEX = /\.md$/i;
const INDEX_FILENAME = 'index.bm25.json';
const DEFAULT_INJECT_TOKENS = 1200;
const DEFAULT_CORE_INJECT_TOKENS = 250;
const DEFAULT_CANDIDATE_LIMIT = 40;
const DEFAULT_ACTIVE_CANDIDATE_LIMIT = 12;
const DEFAULT_FLUSH_INTERVAL_MS = 1500;
const DEFAULT_MIN_SCORE = 0;

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'or',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
  'this',
  'those',
  'these',
  'you',
  'your',
  'we',
  'our',
  'they',
  'their',
]);

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (normalized.length === 0) continue;
    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(normalized);
  }
  return out;
}

function toTopicSlug(topic: string): string {
  const normalized = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized.length > 0 ? normalized : 'memory-topic';
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length > 1 && !STOPWORDS.has(part));
}

function termFrequency(tokens: string[]): Record<string, number> {
  const terms: Record<string, number> = {};
  for (const token of tokens) {
    terms[token] = (terms[token] ?? 0) + 1;
  }
  return terms;
}

function nowIso(): string {
  return new Date().toISOString();
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function splitFrontmatter(raw: string): { frontmatter: string; body: string } | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  return {
    frontmatter: match[1] ?? '',
    body: (match[2] ?? '').trim(),
  };
}

function normalizeMemoryLine(content: string): string {
  const trimmed = content.trim().replace(/^[-*]\s+/, '');
  return trimmed.replace(/\s+/g, ' ');
}

function buildSignature(content: string): string {
  const normalized = normalizeMemoryLine(content).toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, ' ').trim();
}

function deriveTopic(content: string, keywords: string[], key?: string): string {
  if (key && key.trim().length > 0) {
    return key.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }
  const tokens = keywords.length > 0 ? keywords : tokenize(content).slice(0, 4);
  if (tokens.length === 0) return 'general-memory';
  return tokens.join('-');
}

function deriveKeywords(content: string, topic: string, tags: string[], key?: string): string[] {
  const keyTokens = key ? tokenize(key.replace(/\./g, ' ')) : [];
  if (tags.length > 0) return uniq([...tags, ...keyTokens]);
  const candidates = tokenize(`${topic} ${content} ${key ?? ''}`);
  return uniq(candidates).slice(0, 12);
}

function getTypeSectionHeader(type: MemoryType): string {
  if (type === 'semantic') return '## Facts & Preferences';
  if (type === 'episodic') return '## Past Experiences';
  return '## Behavioral Notes';
}

function parseStatus(raw: unknown): MemoryStatus {
  if (raw === 'superseded' || raw === 'deprecated') return raw;
  return 'active';
}

function clampConfidence(confidence: number | undefined): number | undefined {
  if (confidence === undefined) return undefined;
  if (!Number.isFinite(confidence)) return undefined;
  return Math.max(0, Math.min(1, confidence));
}

function computeFrequencyScore(accessCount: number): number {
  return Math.log2(accessCount + 1) / 10;
}

function computeRecencyScore(lastAccessedAt: string, halfLifeMs: number): number {
  const parsed = new Date(lastAccessedAt).getTime();
  if (!Number.isFinite(parsed)) return 0;
  const ageMs = Date.now() - parsed;
  return Math.exp(-ageMs / Math.max(halfLifeMs, 1));
}

function bm25Score(
  queryTerms: string[],
  doc: IndexedStatementDoc,
  index: ScopeIndex,
  params: { k1?: number; b?: number } = {},
): number {
  const k1 = params.k1 ?? 1.2;
  const b = params.b ?? 0.75;
  if (queryTerms.length === 0 || doc.docLen === 0) return 0;

  let score = 0;
  for (const term of queryTerms) {
    const tf = doc.terms[term] ?? 0;
    if (tf === 0) continue;
    const df = index.df[term] ?? 0;
    if (df === 0) continue;
    const idf = Math.log(1 + (index.docCount - df + 0.5) / (df + 0.5));
    const denominator = tf + k1 * (1 - b + (b * doc.docLen) / Math.max(index.avgDocLen, 1));
    score += idf * ((tf * (k1 + 1)) / denominator);
  }
  return score;
}

function getFileMtimeMs(filePath: string): Promise<number> {
  return fs
    .stat(filePath)
    .then((s) => s.mtimeMs)
    .catch(() => 0);
}

function renderBodyFromStatements(statements: MemoryStatement[]): string {
  const active = statements
    .filter((statement) => statement.status === 'active')
    .map((statement) => `- ${normalizeMemoryLine(statement.content)}`);
  return uniq(active).join('\n');
}

function parseStatementsFromBody(body: string, base: { key?: string; now: string }): MemoryStatement[] {
  const lines = body
    .split('\n')
    .map((line) => normalizeMemoryLine(line))
    .filter(Boolean);
  const candidates = lines.length > 0 ? lines : [normalizeMemoryLine(body)].filter(Boolean);

  return uniq(candidates).map((content) => ({
    id: `stmt_${randomUUID()}`,
    content,
    signature: buildSignature(content),
    key: base.key,
    status: 'active',
    createdAt: base.now,
    updatedAt: base.now,
    accessCount: 0,
    lastAccessedAt: base.now,
  }));
}

function normalizeEntry(entry: MemoryEntry): MemoryEntry {
  const topic = entry.topic?.trim() || deriveTopic(entry.content, entry.keywords ?? []);
  const statements = Array.isArray(entry.statements) ? entry.statements : [];
  const bodyContent = renderBodyFromStatements(statements);
  const effectiveContent = bodyContent.length > 0 ? bodyContent : normalizeMemoryLine(entry.content);
  const keyTerms = statements.flatMap((statement) => (statement.key ? tokenize(statement.key.replace(/\./g, ' ')) : []));

  const keywords = uniq(
    entry.keywords?.length
      ? [...entry.keywords, ...keyTerms]
      : deriveKeywords(effectiveContent, topic, entry.tags ?? [], statements[0]?.key),
  );
  const tags = uniq(entry.tags?.length ? entry.tags : keywords);

  return {
    ...entry,
    version: 2,
    topic,
    title: entry.title?.trim() || topic.replace(/-/g, ' '),
    content: effectiveContent,
    keywords,
    tags,
    statements,
  };
}

export class MemoryService {
  private readonly globalDir: string;
  private readonly projectDir: string | null;
  private readonly maxInjectionTokens: number;
  private readonly coreInjectionTokens: number;
  private readonly candidateLimit: number;
  private readonly activeCandidateLimit: number;
  private readonly workspaceId: string | undefined;
  private readonly indexPersisted: boolean;
  private readonly minScore: number;
  private readonly recencyHalfLifeMs: number;
  private readonly flushIntervalMs: number;
  private readonly initPromise: Promise<void>;

  private readonly indexCache = new Map<MemoryScope, { mtimeMs: number; index: ScopeIndex }>();
  private readonly accessBuffer = new Map<string, AccessBufferItem>();
  private flushTimer: NodeJS.Timeout | null = null;
  private flushInProgress = false;

  private migrationStatus: MigrationStatus = {
    currentVersion: 2,
    lastRunAt: nowIso(),
    migratedCount: 0,
    backupsCreated: 0,
    skippedCount: 0,
    warnings: [],
  };

  constructor(config: MemoryServiceConfig) {
    this.globalDir = path.join(config.globalDir, 'global');
    this.projectDir = config.projectDir ? path.join(config.projectDir, 'project') : null;
    this.maxInjectionTokens = config.maxInjectionTokens ?? DEFAULT_INJECT_TOKENS;
    this.coreInjectionTokens = config.coreInjectionTokens ?? DEFAULT_CORE_INJECT_TOKENS;
    this.candidateLimit = config.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT;
    this.activeCandidateLimit = config.activeCandidateLimit ?? DEFAULT_ACTIVE_CANDIDATE_LIMIT;
    this.workspaceId = config.workspaceId;
    this.indexPersisted = config.indexPersisted ?? true;
    this.minScore = config.minScore ?? DEFAULT_MIN_SCORE;

    const halfLifeDays = config.freshnessHalfLifeDays ?? DEFAULT_RECENCY_HALF_LIFE_DAYS;
    this.recencyHalfLifeMs = Math.max(1, Math.round(halfLifeDays * 24 * 60 * 60 * 1000));
    this.flushIntervalMs = config.indexFlushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;

    this.initPromise = this.initialize().catch((error) => {
      console.warn('[MemoryService] Failed to initialize memory service', error);
    });
  }

  private async initialize(): Promise<void> {
    await this.ensureScopeDirs('global');
    if (this.projectDir) {
      await this.ensureScopeDirs('project');
    }

    await this.migrateV1ToV2(true);
    await this.rebuildIndexInternal('global', this.workspaceId, true);
    if (this.projectDir) {
      await this.rebuildIndexInternal('project', this.workspaceId, true);
    }
  }

  private async ensureReady(): Promise<void> {
    await this.initPromise;
  }

  private scheduleAccessFlush(): void {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      void this.flushAccessBuffer();
    }, this.flushIntervalMs);
    this.flushTimer.unref?.();
  }

  private async ensureScopeDirs(scope: MemoryScope): Promise<void> {
    const baseDir = this.getScopeBaseDir(scope);
    if (!baseDir) return;
    try {
      await fs.mkdir(path.join(baseDir, 'topics'), { recursive: true });
    } catch (error) {
      console.warn(`[MemoryService] Failed to create memory directories for scope ${scope}`, error);
    }
  }

  private getScopeBaseDir(scope: MemoryScope): string | null {
    if (scope === 'global') return this.globalDir;
    return this.projectDir;
  }

  private getScopeTopicDir(scope: MemoryScope): string | null {
    const baseDir = this.getScopeBaseDir(scope);
    return baseDir ? path.join(baseDir, 'topics') : null;
  }

  private getScopeIndexFile(scope: MemoryScope): string | null {
    const baseDir = this.getScopeBaseDir(scope);
    return baseDir ? path.join(baseDir, INDEX_FILENAME) : null;
  }

  private getTopicFilePath(scope: MemoryScope, topicSlug: string): string | null {
    const topicDir = this.getScopeTopicDir(scope);
    return topicDir ? path.join(topicDir, `${topicSlug}.md`) : null;
  }

  private async listTopicFiles(scope: MemoryScope): Promise<string[]> {
    const topicDir = this.getScopeTopicDir(scope);
    if (!topicDir) return [];
    try {
      const entries = await fs.readdir(topicDir, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isFile() && MEMORY_FILE_REGEX.test(entry.name))
        .map((entry) => path.join(topicDir, entry.name));
    } catch {
      return [];
    }
  }

  private toStatement(raw: unknown, defaults: { now: string; key?: string }): MemoryStatement | null {
    if (!raw || typeof raw !== 'object') return null;
    const data = raw as Record<string, unknown>;
    const content = typeof data['content'] === 'string' ? normalizeMemoryLine(data['content']) : '';
    if (!content) return null;

    return {
      id: typeof data['id'] === 'string' ? data['id'] : `stmt_${randomUUID()}`,
      content,
      signature: typeof data['signature'] === 'string' ? data['signature'] : buildSignature(content),
      key: typeof data['key'] === 'string' ? data['key'] : defaults.key,
      status: parseStatus(data['status']),
      supersedes: Array.isArray(data['supersedes'])
        ? data['supersedes'].filter((value): value is string => typeof value === 'string')
        : undefined,
      contradicts: Array.isArray(data['contradicts'])
        ? data['contradicts'].filter((value): value is string => typeof value === 'string')
        : undefined,
      confidence: clampConfidence(typeof data['confidence'] === 'number' ? data['confidence'] : undefined),
      evidence: Array.isArray(data['evidence'])
        ? data['evidence'].filter((value): value is string => typeof value === 'string')
        : undefined,
      createdAt: typeof data['createdAt'] === 'string' ? data['createdAt'] : defaults.now,
      updatedAt: typeof data['updatedAt'] === 'string' ? data['updatedAt'] : defaults.now,
      accessCount: typeof data['accessCount'] === 'number' ? data['accessCount'] : 0,
      lastAccessedAt: typeof data['lastAccessedAt'] === 'string' ? data['lastAccessedAt'] : defaults.now,
    };
  }

  private async readTopicFile(filePath: string): Promise<MemoryEntry | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = splitFrontmatter(raw);
      if (!parsed) return null;

      const frontmatter = parseYaml(parsed.frontmatter) as Record<string, unknown>;
      const now = nowIso();
      const topic = String(frontmatter['topic'] ?? '').trim() || path.basename(filePath, '.md');
      const scope = (frontmatter['scope'] as MemoryScope) ?? 'global';
      const source = (frontmatter['source'] as MemorySource) ?? 'explicit';
      const version = Number(frontmatter['version'] ?? 1);

      const maybeKeywords = Array.isArray(frontmatter['keywords']) ? frontmatter['keywords'] : [];
      const maybeTags = Array.isArray(frontmatter['tags']) ? frontmatter['tags'] : [];
      const statementSeedKey = typeof frontmatter['key'] === 'string' ? frontmatter['key'] : undefined;

      let statements: MemoryStatement[] = [];
      if (Array.isArray(frontmatter['statements'])) {
        for (const rawStatement of frontmatter['statements']) {
          const parsedStatement = this.toStatement(rawStatement, { now, key: statementSeedKey });
          if (parsedStatement) {
            statements.push(parsedStatement);
          }
        }
      }

      if (statements.length === 0 && parsed.body.trim().length > 0) {
        statements = parseStatementsFromBody(parsed.body, { now, key: statementSeedKey });
      }

      const entry: MemoryEntry = {
        id: String(frontmatter['id'] ?? `mem_topic_${randomUUID()}`),
        topic,
        title: typeof frontmatter['title'] === 'string' ? frontmatter['title'] : undefined,
        content: parsed.body,
        version: Number.isFinite(version) ? version : 1,
        statements,
        type: (frontmatter['type'] as MemoryType) ?? 'semantic',
        scope,
        tags: maybeTags.filter((value): value is string => typeof value === 'string'),
        keywords: maybeKeywords.filter((value): value is string => typeof value === 'string'),
        workspaceId: typeof frontmatter['workspaceId'] === 'string' ? frontmatter['workspaceId'] : undefined,
        createdAt: String(frontmatter['createdAt'] ?? now),
        updatedAt: String(frontmatter['updatedAt'] ?? now),
        accessCount: Number(frontmatter['accessCount'] ?? 0),
        lastAccessedAt: String(frontmatter['lastAccessedAt'] ?? now),
        source,
      };

      return normalizeEntry(entry);
    } catch {
      return null;
    }
  }

  private async writeTopicFile(scope: MemoryScope, entry: MemoryEntry): Promise<void> {
    const topicSlug = toTopicSlug(entry.topic);
    const filePath = this.getTopicFilePath(scope, topicSlug);
    if (!filePath) return;

    const normalized = normalizeEntry(entry);
    const body = renderBodyFromStatements(normalized.statements ?? []);

    const frontmatter = {
      id: normalized.id,
      topic: normalized.topic,
      title: normalized.title ?? normalized.topic.replace(/-/g, ' '),
      scope: normalized.scope,
      ...(normalized.workspaceId ? { workspaceId: normalized.workspaceId } : {}),
      type: normalized.type,
      keywords: uniq(normalized.keywords),
      tags: uniq(normalized.tags),
      source: normalized.source,
      createdAt: normalized.createdAt,
      updatedAt: normalized.updatedAt,
      accessCount: normalized.accessCount,
      lastAccessedAt: normalized.lastAccessedAt,
      version: 2,
      statements: (normalized.statements ?? []).map((statement) => ({
        id: statement.id,
        content: normalizeMemoryLine(statement.content),
        signature: statement.signature,
        ...(statement.key ? { key: statement.key } : {}),
        status: statement.status,
        ...(statement.supersedes?.length ? { supersedes: uniq(statement.supersedes) } : {}),
        ...(statement.contradicts?.length ? { contradicts: uniq(statement.contradicts) } : {}),
        ...(statement.confidence !== undefined ? { confidence: statement.confidence } : {}),
        ...(statement.evidence?.length ? { evidence: uniq(statement.evidence) } : {}),
        createdAt: statement.createdAt,
        updatedAt: statement.updatedAt,
        accessCount: statement.accessCount,
        lastAccessedAt: statement.lastAccessedAt,
      })),
    };

    const text = `---\n${stringifyYaml(frontmatter).trim()}\n---\n\n${body}\n`;
    try {
      await this.ensureScopeDirs(scope);
      await fs.writeFile(filePath, text, 'utf-8');
    } catch (error) {
      console.warn(`[MemoryService] Failed to write topic file for scope ${scope}`, error);
    }
  }

  private async loadEntriesWithPath(scope: MemoryScope): Promise<TopicFileDoc[]> {
    const files = await this.listTopicFiles(scope);
    const docs: TopicFileDoc[] = [];
    for (const filePath of files) {
      const entry = await this.readTopicFile(filePath);
      if (!entry) continue;
      docs.push({ path: filePath, entry: normalizeEntry(entry) });
    }
    return docs;
  }

  private async loadEntries(scope: MemoryScope): Promise<MemoryEntry[]> {
    const docs = await this.loadEntriesWithPath(scope);
    return docs.map((doc) => doc.entry);
  }

  private entryToIndexDocs(entry: MemoryEntry): IndexedStatementDoc[] {
    const topicSlug = toTopicSlug(entry.topic);
    const docs: IndexedStatementDoc[] = [];

    for (const statement of entry.statements ?? []) {
      const searchable = `${entry.topic} ${entry.title ?? ''} ${entry.keywords.join(' ')} ${statement.key ?? ''} ${statement.content}`;
      const tokens = tokenize(searchable);
      const terms = termFrequency(tokens);
      const docLen = Object.values(terms).reduce((sum, value) => sum + value, 0);
      docs.push({
        id: `${topicSlug}#${statement.id}`,
        topicSlug,
        entry,
        statement,
        docLen,
        terms,
      });
    }

    return docs;
  }

  private async rebuildIndexInternal(scope: MemoryScope, workspaceId?: string, skipEnsureReady = false): Promise<void> {
    if (!skipEnsureReady) {
      await this.ensureReady();
    }

    const entries = await this.loadEntries(scope);
    const docsById: Record<string, IndexedStatementDoc> = {};
    const df: Record<string, number> = {};
    let totalLen = 0;

    for (const entry of entries) {
      const indexed = this.entryToIndexDocs(entry);
      for (const doc of indexed) {
        docsById[doc.id] = doc;
        totalLen += doc.docLen;
        for (const term of Object.keys(doc.terms)) {
          df[term] = (df[term] ?? 0) + 1;
        }
      }
    }

    const docCount = Object.keys(docsById).length;
    const index: ScopeIndex = {
      version: 2,
      scope,
      workspaceId: workspaceId ?? this.workspaceId,
      docCount,
      avgDocLen: docCount > 0 ? totalLen / docCount : 0,
      df,
      docs: docsById,
      updatedAt: nowIso(),
    };

    const indexFile = this.getScopeIndexFile(scope);
    if (indexFile && this.indexPersisted) {
      try {
        await this.ensureScopeDirs(scope);
        await fs.writeFile(indexFile, JSON.stringify(index, null, 2), 'utf-8');
      } catch (error) {
        console.warn(`[MemoryService] Failed to persist index for scope ${scope}`, error);
      }
    }

    const mtime = indexFile ? await getFileMtimeMs(indexFile) : Date.now();
    this.indexCache.set(scope, { index, mtimeMs: mtime || Date.now() });
  }

  async rebuildIndex(scope: MemoryScope, workspaceId?: string): Promise<void> {
    await this.rebuildIndexInternal(scope, workspaceId, false);
  }

  private async loadIndex(scope: MemoryScope): Promise<ScopeIndex> {
    const indexFile = this.getScopeIndexFile(scope);

    if (indexFile && this.indexPersisted) {
      const fileMtimeMs = await getFileMtimeMs(indexFile);
      const cached = this.indexCache.get(scope);
      if (cached && fileMtimeMs > 0 && cached.mtimeMs === fileMtimeMs) {
        return cached.index;
      }

      try {
        const text = await fs.readFile(indexFile, 'utf-8');
        const parsed = JSON.parse(text) as ScopeIndex;
        if (parsed?.version === 2 && parsed.scope === scope && parsed.docs) {
          this.indexCache.set(scope, { index: parsed, mtimeMs: fileMtimeMs || Date.now() });
          return parsed;
        }
      } catch {
        // rebuild below
      }
    }

    await this.rebuildIndexInternal(scope, this.workspaceId, true);
    const rebuilt = this.indexCache.get(scope);
    if (rebuilt) return rebuilt.index;

    return {
      version: 2,
      scope,
      workspaceId: this.workspaceId,
      docCount: 0,
      avgDocLen: 0,
      df: {},
      docs: {},
      updatedAt: nowIso(),
    };
  }

  private async migrateLegacyJson(scope: MemoryScope): Promise<{ migrated: number; backups: number; skipped: number }> {
    const baseDir = this.getScopeBaseDir(scope);
    if (!baseDir) return { migrated: 0, backups: 0, skipped: 0 };

    const legacyFile = path.join(path.dirname(baseDir), 'memories.json');
    const topicFiles = await this.listTopicFiles(scope);
    if (topicFiles.length > 0) {
      return { migrated: 0, backups: 0, skipped: 0 };
    }

    let migrated = 0;
    let skipped = 0;
    let backups = 0;

    try {
      const text = await fs.readFile(legacyFile, 'utf-8');
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) {
        return { migrated, backups, skipped };
      }

      for (const item of parsed) {
        if (!item || typeof item !== 'object') {
          skipped += 1;
          continue;
        }

        const data = item as Partial<MemoryEntry>;
        if (typeof data.content !== 'string' || typeof data.type !== 'string') {
          skipped += 1;
          continue;
        }

        const topic = typeof data.topic === 'string' ? data.topic : deriveTopic(data.content, data.tags ?? []);

        await this.upsertTopicMemoryInternal(
          {
            content: data.content,
            type: data.type as MemoryType,
            scope,
            source: (data.source as MemorySource) ?? 'imported',
            topic,
            keywords: data.keywords ?? data.tags ?? [],
            tags: data.tags ?? [],
            workspaceId: data.workspaceId,
            updateMode: 'merge',
          },
          { skipEnsureReady: true, skipReindex: true },
        );
        migrated += 1;
      }

      const backupFile = `${legacyFile}.bak.${Date.now()}`;
      await fs.copyFile(legacyFile, backupFile);
      backups += 1;
    } catch {
      // best effort
    }

    return { migrated, backups, skipped };
  }

  private async migrateTopicFilesToV2(scope: MemoryScope): Promise<{ migrated: number; backups: number; skipped: number }> {
    const files = await this.listTopicFiles(scope);
    let migrated = 0;
    let backups = 0;
    let skipped = 0;

    for (const filePath of files) {
      try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const parsed = splitFrontmatter(raw);
        if (!parsed) {
          skipped += 1;
          continue;
        }

        const frontmatter = parseYaml(parsed.frontmatter) as Record<string, unknown>;
        const version = Number(frontmatter['version'] ?? 1);
        const hasStatements = Array.isArray(frontmatter['statements']);
        if (version >= 2 && hasStatements) {
          continue;
        }

        const backupPath = `${filePath}.v1.bak.${Date.now()}`;
        await fs.copyFile(filePath, backupPath);
        backups += 1;

        const entry = await this.readTopicFile(filePath);
        if (!entry) {
          skipped += 1;
          continue;
        }

        const upgraded = normalizeEntry({
          ...entry,
          version: 2,
          statements:
            entry.statements && entry.statements.length > 0
              ? entry.statements
              : parseStatementsFromBody(entry.content, { now: nowIso() }),
        });

        await this.writeTopicFile(scope, upgraded);
        migrated += 1;
      } catch {
        skipped += 1;
      }
    }

    return { migrated, backups, skipped };
  }

  async migrateV1ToV2(skipEnsureReady = false): Promise<MigrationStatus> {
    if (!skipEnsureReady) {
      await this.ensureReady();
    }

    const warnings: string[] = [];
    let migratedCount = 0;
    let backupsCreated = 0;
    let skippedCount = 0;

    const scopes: MemoryScope[] = this.projectDir ? ['global', 'project'] : ['global'];

    for (const scope of scopes) {
      const legacy = await this.migrateLegacyJson(scope);
      migratedCount += legacy.migrated;
      backupsCreated += legacy.backups;
      skippedCount += legacy.skipped;

      const files = await this.migrateTopicFilesToV2(scope);
      migratedCount += files.migrated;
      backupsCreated += files.backups;
      skippedCount += files.skipped;
    }

    if (skippedCount > 0) {
      warnings.push(`Skipped ${skippedCount} malformed memory records during migration.`);
    }

    this.migrationStatus = {
      currentVersion: 2,
      lastRunAt: nowIso(),
      migratedCount,
      backupsCreated,
      skippedCount,
      warnings,
    };

    return { ...this.migrationStatus };
  }

  async getMigrationStatus(): Promise<MigrationStatus> {
    await this.ensureReady();
    return { ...this.migrationStatus };
  }

  private inferTopic(input: TopicMemoryInput): string {
    const key = input.key?.trim();
    const provided = input.topic?.trim();
    if (provided) return provided;
    return deriveTopic(input.content, input.keywords ?? input.tags ?? [], key);
  }

  private makeStatement(input: TopicMemoryInput, timestamp: string): MemoryStatement {
    const normalized = normalizeMemoryLine(input.content);
    return {
      id: `stmt_${randomUUID()}`,
      content: normalized,
      signature: buildSignature(normalized),
      key: input.key?.trim() || undefined,
      status: 'active',
      confidence: clampConfidence(input.confidence),
      evidence: input.evidence ? uniq(input.evidence) : undefined,
      contradicts: input.contradicts ? uniq(input.contradicts) : undefined,
      createdAt: timestamp,
      updatedAt: timestamp,
      accessCount: 0,
      lastAccessedAt: timestamp,
    };
  }

  private upsertStatements(existing: MemoryStatement[], incoming: MemoryStatement, mode: TopicUpdateMode): MemoryStatement[] {
    const timestamp = incoming.updatedAt;
    const statements = [...existing];

    if (mode === 'replace') {
      for (let i = 0; i < statements.length; i += 1) {
        if (statements[i]?.status === 'active') {
          statements[i] = {
            ...statements[i],
            status: 'superseded',
            updatedAt: timestamp,
          };
        }
      }
      return [...statements, incoming];
    }

    if (incoming.key) {
      const keyMatchIndex = statements.findIndex((statement) => statement.status === 'active' && statement.key === incoming.key);
      if (keyMatchIndex >= 0) {
        const matched = statements[keyMatchIndex] as MemoryStatement;
        if (matched.signature === incoming.signature) {
          const mergedEvidence = uniq([...(matched.evidence ?? []), ...(incoming.evidence ?? [])]);
          statements[keyMatchIndex] = {
            ...matched,
            updatedAt: timestamp,
            confidence: Math.max(matched.confidence ?? 0, incoming.confidence ?? 0),
            evidence: mergedEvidence.length > 0 ? mergedEvidence : undefined,
          };
          return statements;
        }

        const incomingConfidence = incoming.confidence ?? 0.5;
        const matchedConfidence = matched.confidence ?? 0.5;

        if (incomingConfidence >= matchedConfidence) {
          statements[keyMatchIndex] = {
            ...matched,
            status: 'superseded',
            updatedAt: timestamp,
          };
          incoming.supersedes = uniq([...(incoming.supersedes ?? []), matched.id]);
          return [...statements, incoming];
        }

        return [
          ...statements,
          {
            ...incoming,
            status: 'deprecated',
            contradicts: uniq([...(incoming.contradicts ?? []), matched.id]),
          },
        ];
      }
    }

    const signatureMatchIndex = statements.findIndex(
      (statement) => statement.status === 'active' && statement.signature === incoming.signature,
    );
    if (signatureMatchIndex >= 0) {
      const matched = statements[signatureMatchIndex] as MemoryStatement;
      const mergedEvidence = uniq([...(matched.evidence ?? []), ...(incoming.evidence ?? [])]);
      statements[signatureMatchIndex] = {
        ...matched,
        updatedAt: timestamp,
        confidence: Math.max(matched.confidence ?? 0, incoming.confidence ?? 0),
        evidence: mergedEvidence.length > 0 ? mergedEvidence : undefined,
      };
      return statements;
    }

    if (incoming.contradicts?.length) {
      for (let i = 0; i < statements.length; i += 1) {
        const statement = statements[i];
        if (!statement) continue;
        if (!incoming.contradicts.includes(statement.id)) continue;
        const incomingConfidence = incoming.confidence ?? 0.5;
        const currentConfidence = statement.confidence ?? 0.5;
        if (incomingConfidence >= currentConfidence && statement.status === 'active') {
          statements[i] = {
            ...statement,
            status: 'superseded',
            updatedAt: timestamp,
          };
          incoming.supersedes = uniq([...(incoming.supersedes ?? []), statement.id]);
        }
      }
    }

    return [...statements, incoming];
  }

  private async upsertTopicMemoryInternal(
    input: TopicMemoryInput,
    options: { skipEnsureReady?: boolean; skipReindex?: boolean } = {},
  ): Promise<MemoryEntry> {
    if (!options.skipEnsureReady) {
      await this.ensureReady();
    }

    const scope = input.scope;
    const topic = this.inferTopic(input).trim();
    const topicSlug = toTopicSlug(topic);
    const filePath = this.getTopicFilePath(scope, topicSlug);
    if (!filePath) {
      throw new Error(`Scope ${scope} is not configured`);
    }

    const existing = await this.readTopicFile(filePath);
    const timestamp = nowIso();
    const mode: TopicUpdateMode = input.updateMode ?? 'merge';

    const existingStatements = existing?.statements ?? parseStatementsFromBody(existing?.content ?? '', { now: timestamp });
    const parsedIncoming = !input.key
      ? parseStatementsFromBody(input.content, { now: timestamp, key: undefined })
      : [];
    const incomingStatements =
      parsedIncoming.length > 0
        ? parsedIncoming.map((statement) => ({
            ...statement,
            confidence: clampConfidence(input.confidence),
            evidence: input.evidence ? uniq(input.evidence) : undefined,
            contradicts: input.contradicts ? uniq(input.contradicts) : undefined,
          }))
        : [this.makeStatement(input, timestamp)];

    let statements = [...existingStatements];
    if (mode === 'replace') {
      statements = statements.map((statement) =>
        statement.status === 'active'
          ? {
              ...statement,
              status: 'superseded',
              updatedAt: timestamp,
            }
          : statement,
      );
      for (const incoming of incomingStatements) {
        statements = this.upsertStatements(statements, incoming, 'merge');
      }
    } else {
      for (const incoming of incomingStatements) {
        statements = this.upsertStatements(statements, incoming, 'merge');
      }
    }

    const keywords = uniq(
      input.keywords ?? deriveKeywords(input.content, topic, input.tags ?? [], input.key),
    );
    const tags = uniq(input.tags ?? keywords);

    const entry = normalizeEntry({
      id: existing?.id ?? `mem_topic_${randomUUID()}`,
      topic,
      title: input.title?.trim() || existing?.title || topic.replace(/-/g, ' '),
      content: renderBodyFromStatements(statements),
      version: 2,
      statements,
      type: input.type,
      scope,
      tags,
      keywords,
      workspaceId:
        input.workspaceId ??
        existing?.workspaceId ??
        (scope === 'project' ? this.workspaceId : undefined),
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
      accessCount: existing?.accessCount ?? 0,
      lastAccessedAt: existing?.lastAccessedAt ?? timestamp,
      source: input.source,
    });

    await this.writeTopicFile(scope, entry);
    this.indexCache.delete(scope);

    if (!options.skipReindex) {
      await this.rebuildIndexInternal(scope, entry.workspaceId, options.skipEnsureReady === true);
    }

    return entry;
  }

  async upsertTopicMemory(input: TopicMemoryInput): Promise<MemoryEntry> {
    return this.upsertTopicMemoryInternal(input, { skipEnsureReady: false, skipReindex: false });
  }

  async addMemory(input: TopicMemoryInput): Promise<MemoryEntry> {
    return this.upsertTopicMemory({
      ...input,
      updateMode: input.updateMode ?? 'merge',
    });
  }

  async deleteMemory(id: string): Promise<boolean> {
    await this.ensureReady();
    for (const scope of ['global', 'project'] as const) {
      if (scope === 'project' && !this.projectDir) continue;

      const docs = await this.loadEntriesWithPath(scope);
      const target = docs.find((doc) => doc.entry.id === id);
      if (!target) continue;

      await fs.unlink(target.path);
      this.indexCache.delete(scope);
      await this.rebuildIndex(scope, target.entry.workspaceId);
      return true;
    }

    return false;
  }

  async getAllMemories(): Promise<MemoryEntry[]> {
    await this.ensureReady();
    await this.flushAccessBuffer();

    const global = await this.loadEntries('global');
    const project = this.projectDir ? await this.loadEntries('project') : [];
    return [...global, ...project];
  }

  async clearMemories(scope?: MemoryScope): Promise<void> {
    await this.ensureReady();

    const scopes: MemoryScope[] = scope ? [scope] : ['global', 'project'];
    for (const targetScope of scopes) {
      if (targetScope === 'project' && !this.projectDir) continue;

      const topicDir = this.getScopeTopicDir(targetScope);
      const indexFile = this.getScopeIndexFile(targetScope);

      if (topicDir) {
        await fs.rm(topicDir, { recursive: true, force: true });
        await fs.mkdir(topicDir, { recursive: true });
      }
      if (indexFile) {
        await fs.rm(indexFile, { force: true });
      }
      this.indexCache.delete(targetScope);
    }
  }

  private async rankStatements(options: RankedStatementsOptions): Promise<RankedStatement[]> {
    await this.ensureReady();

    const scopes = options.scopes ?? (this.projectDir ? (['global', 'project'] as MemoryScope[]) : ['global']);
    const queryTerms = tokenize(`${options.query ?? ''} ${options.key ?? ''}`);
    const candidateLimit = options.candidateLimit ?? this.candidateLimit;
    const minScore = options.minScore ?? this.minScore;
    const allowedTypes = options.allowedTypes ? new Set(options.allowedTypes) : null;

    const scored: RankedStatement[] = [];

    for (const scope of scopes) {
      if (scope === 'project' && !this.projectDir) continue;
      const index = await this.loadIndex(scope);

      let maxBm25 = 0;
      const scopeCandidates: Array<{ entry: MemoryEntry; statement: MemoryStatement; bm25: number }> = [];

      for (const doc of Object.values(index.docs)) {
        const status = doc.statement.status;
        if (!options.includeNonActive && status !== 'active') {
          continue;
        }

        if (allowedTypes && !allowedTypes.has(doc.entry.type)) {
          continue;
        }

        if (options.key && doc.statement.key !== options.key) {
          continue;
        }

        if (
          doc.entry.scope === 'project' &&
          options.workspaceId &&
          doc.entry.workspaceId &&
          doc.entry.workspaceId !== options.workspaceId
        ) {
          continue;
        }

        const bm25 = bm25Score(queryTerms, doc, index);
        maxBm25 = Math.max(maxBm25, bm25);
        scopeCandidates.push({ entry: doc.entry, statement: doc.statement, bm25 });
      }

      for (const candidate of scopeCandidates) {
        const normalizedBm25 = maxBm25 > 0 ? candidate.bm25 / maxBm25 : 0;
        const fallbackBm25 = queryTerms.length === 0 ? 0.25 : normalizedBm25;
        const recency = computeRecencyScore(candidate.statement.lastAccessedAt, this.recencyHalfLifeMs);
        const frequency = computeFrequencyScore(candidate.statement.accessCount);
        const typeWeight = TYPE_WEIGHTS[candidate.entry.type];
        const scopeBoost = candidate.entry.scope === 'project' ? 0.05 : 0;

        const score = fallbackBm25 * 0.55 + recency * 0.2 + frequency * 0.1 + typeWeight * 0.1 + scopeBoost;
        if (score < minScore) continue;

        scored.push({
          entry: candidate.entry,
          statement: candidate.statement,
          score,
        });
      }
    }

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.statement.updatedAt !== a.statement.updatedAt) return b.statement.updatedAt.localeCompare(a.statement.updatedAt);
      return a.statement.id.localeCompare(b.statement.id);
    });

    const deduped = new Map<string, RankedStatement>();

    for (const item of scored) {
      const dedupeKey = item.statement.key ? `key:${item.statement.key}` : `sig:${item.statement.signature}`;
      const existing = deduped.get(dedupeKey);
      if (!existing) {
        deduped.set(dedupeKey, item);
        continue;
      }

      const preferProject = existing.entry.scope === 'global' && item.entry.scope === 'project';
      if (preferProject || item.score > existing.score) {
        deduped.set(dedupeKey, item);
      }
    }

    return Array.from(deduped.values()).slice(0, candidateLimit);
  }

  async searchMemories(options: SearchMemoryOptions): Promise<MemoryEntry[]> {
    const ranked = await this.rankStatements({
      query: options.query,
      workspaceId: options.workspaceId,
      scopes: options.scopes,
      candidateLimit: options.candidateLimit ?? this.candidateLimit,
      minScore: options.minScore,
    });

    return ranked.map(({ entry, statement }) => ({
      ...entry,
      id: `${entry.id}:${statement.id}`,
      content: normalizeMemoryLine(statement.content),
      statements: [statement],
      version: 2,
      accessCount: statement.accessCount,
      lastAccessedAt: statement.lastAccessedAt,
      updatedAt: statement.updatedAt,
      createdAt: statement.createdAt,
    }));
  }

  async queryStatements(options: QueryStatementsOptions): Promise<MemoryQueryHit[]> {
    const ranked = await this.rankStatements({
      query: options.query,
      key: options.key,
      workspaceId: options.workspaceId,
      scopes: options.scopes,
      candidateLimit: options.candidateLimit ?? this.activeCandidateLimit,
      minScore: options.minScore,
    });

    return ranked.map(({ entry, statement, score }) => ({
      id: `${entry.id}:${statement.id}`,
      statementId: statement.id,
      key: statement.key,
      topic: entry.topic,
      scope: entry.scope,
      type: entry.type,
      content: normalizeMemoryLine(statement.content),
      score: Number(score.toFixed(6)),
      confidence: statement.confidence,
      updatedAt: statement.updatedAt,
    }));
  }

  private queueAccessUpdate(entry: MemoryEntry): void {
    const statement = entry.statements?.[0];
    if (!statement) return;

    const topicSlug = toTopicSlug(entry.topic);
    const bufferKey = `${entry.scope}:${topicSlug}:${statement.id}`;
    const current = this.accessBuffer.get(bufferKey);

    this.accessBuffer.set(bufferKey, {
      scope: entry.scope,
      topicSlug,
      statementId: statement.id,
      count: (current?.count ?? 0) + 1,
      lastAccessedAt: nowIso(),
    });

    this.scheduleAccessFlush();
  }

  async flushAccessBuffer(): Promise<void> {
    if (this.flushInProgress) return;
    if (this.accessBuffer.size === 0) return;

    this.flushInProgress = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    try {
      const buffered = Array.from(this.accessBuffer.values());
      this.accessBuffer.clear();

      const grouped = new Map<string, AccessBufferItem[]>();
      for (const item of buffered) {
        const key = `${item.scope}:${item.topicSlug}`;
        const bucket = grouped.get(key) ?? [];
        bucket.push(item);
        grouped.set(key, bucket);
      }

      const touchedScopes = new Set<MemoryScope>();

      for (const [groupKey, updates] of grouped.entries()) {
        const split = groupKey.indexOf(':');
        const scope = groupKey.slice(0, split) as MemoryScope;
        const topicSlug = groupKey.slice(split + 1);
        const filePath = this.getTopicFilePath(scope, topicSlug);
        if (!filePath) continue;

        const entry = await this.readTopicFile(filePath);
        if (!entry) continue;

        const statements = [...(entry.statements ?? [])];
        let changed = false;

        for (let i = 0; i < statements.length; i += 1) {
          const statement = statements[i];
          if (!statement) continue;

          const update = updates.find((item) => item.statementId === statement.id);
          if (!update) continue;

          statements[i] = {
            ...statement,
            accessCount: statement.accessCount + update.count,
            lastAccessedAt: update.lastAccessedAt,
            updatedAt: update.lastAccessedAt,
          };
          changed = true;
        }

        if (!changed) continue;

        const totalAccess = statements.reduce((sum, statement) => sum + statement.accessCount, 0);
        const latestAccess = statements.reduce(
          (latest, statement) => (statement.lastAccessedAt > latest ? statement.lastAccessedAt : latest),
          entry.lastAccessedAt,
        );

        await this.writeTopicFile(
          scope,
          normalizeEntry({
            ...entry,
            statements,
            accessCount: totalAccess,
            lastAccessedAt: latestAccess,
            updatedAt: nowIso(),
          }),
        );

        touchedScopes.add(scope);
      }

      for (const scope of touchedScopes) {
        this.indexCache.delete(scope);
        await this.rebuildIndexInternal(scope, this.workspaceId, true);
      }
    } finally {
      this.flushInProgress = false;
    }
  }

  async buildMemoryInjection(options: BuildMemoryInjectionOptions): Promise<string> {
    const injectTokenBudget = options.injectTokenBudget ?? this.maxInjectionTokens;
    const candidates = await this.searchMemories({
      query: options.query,
      workspaceId: options.workspaceId,
      candidateLimit: options.candidateLimit ?? this.candidateLimit,
    });

    if (candidates.length === 0) return '';

    const grouped: Record<MemoryType, string[]> = {
      semantic: [],
      episodic: [],
      procedural: [],
    };

    let usedTokens = 0;
    const selected: MemoryEntry[] = [];

    for (const entry of candidates) {
      const statement = entry.statements?.[0];
      const compactContent = normalizeMemoryLine(entry.content);
      const confidenceSuffix = statement?.confidence !== undefined ? ` (confidence ${statement.confidence.toFixed(2)})` : '';
      const bullet = `- [${entry.scope}] ${entry.topic}: ${compactContent}${confidenceSuffix}`;
      const tokenCost = estimateTokens(bullet);
      if (usedTokens + tokenCost > injectTokenBudget) continue;

      grouped[entry.type].push(bullet);
      selected.push(entry);
      usedTokens += tokenCost;
    }

    if (selected.length === 0) return '';

    for (const entry of selected) {
      this.queueAccessUpdate(entry);
    }

    const sections: string[] = [];
    for (const type of ['semantic', 'episodic', 'procedural'] as const) {
      if (grouped[type].length === 0) continue;
      sections.push(getTypeSectionHeader(type), grouped[type].join('\n'));
    }

    return sections.join('\n\n');
  }

  async buildCoreMemoryInjection(options: BuildCoreMemoryInjectionOptions = {}): Promise<string> {
    const injectTokenBudget = options.injectTokenBudget ?? this.coreInjectionTokens;
    const candidates = await this.rankStatements({
      query: '',
      workspaceId: options.workspaceId ?? this.workspaceId,
      candidateLimit: options.candidateLimit ?? this.activeCandidateLimit,
      allowedTypes: ['semantic', 'procedural'],
    });

    if (candidates.length === 0) return '';

    const grouped: Record<MemoryType, string[]> = {
      semantic: [],
      episodic: [],
      procedural: [],
    };

    let usedTokens = 0;
    const selected: MemoryEntry[] = [];

    for (const candidate of candidates) {
      const { entry, statement } = candidate;
      const compactContent = normalizeMemoryLine(statement.content);
      const confidenceSuffix = statement.confidence !== undefined ? ` (confidence ${statement.confidence.toFixed(2)})` : '';
      const bullet = `- [${entry.scope}] ${entry.topic}: ${compactContent}${confidenceSuffix}`;
      const tokenCost = estimateTokens(bullet);
      if (usedTokens + tokenCost > injectTokenBudget) continue;

      grouped[entry.type].push(bullet);
      selected.push({
        ...entry,
        id: `${entry.id}:${statement.id}`,
        statements: [statement],
      });
      usedTokens += tokenCost;
    }

    if (selected.length === 0) return '';

    for (const entry of selected) {
      this.queueAccessUpdate(entry);
    }

    const sections: string[] = [];
    for (const type of ['semantic', 'procedural'] as const) {
      if (grouped[type].length === 0) continue;
      sections.push(getTypeSectionHeader(type), grouped[type].join('\n'));
    }

    return sections.join('\n\n');
  }

  async getMemoryPromptInjection(limit?: number): Promise<string> {
    const candidateLimit = limit ?? this.candidateLimit;
    return this.buildMemoryInjection({
      query: '',
      workspaceId: this.workspaceId,
      candidateLimit,
      injectTokenBudget: this.maxInjectionTokens,
    });
  }
}
