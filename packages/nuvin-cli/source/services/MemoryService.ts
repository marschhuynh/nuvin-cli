import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { MemoryEntry, MemoryScope, MemorySource, MemoryType } from '@nuvin/nuvin-core';

interface MemoryServiceConfig {
  globalDir: string;
  projectDir?: string;
  workspaceId?: string;
  maxInjectionTokens?: number;
  candidateLimit?: number;
  indexPersisted?: boolean;
}

type TopicUpdateMode = 'merge' | 'replace';

type TopicMemoryInput = {
  content: string;
  type: MemoryType;
  scope: MemoryScope;
  source: MemorySource;
  topic?: string;
  title?: string;
  tags?: string[];
  keywords?: string[];
  workspaceId?: string;
  updateMode?: TopicUpdateMode;
};

type SearchMemoryOptions = {
  query: string;
  workspaceId?: string;
  scopes?: MemoryScope[];
  candidateLimit?: number;
};

type BuildMemoryInjectionOptions = {
  query: string;
  workspaceId?: string;
  injectTokenBudget?: number;
  candidateLimit?: number;
};

type TopicFileDoc = {
  path: string;
  entry: MemoryEntry;
};

type IndexedDoc = {
  entry: MemoryEntry;
  docLen: number;
  terms: Record<string, number>;
};

type ScopeIndex = {
  version: 1;
  scope: MemoryScope;
  workspaceId?: string;
  docCount: number;
  avgDocLen: number;
  df: Record<string, number>;
  docs: Record<string, IndexedDoc>;
  updatedAt: string;
};

const TYPE_WEIGHTS: Record<MemoryType, number> = {
  semantic: 0.6,
  episodic: 0.3,
  procedural: 0.1,
};

const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;
const MEMORY_FILE_REGEX = /\.md$/i;
const INDEX_FILENAME = 'index.bm25.json';
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

function computeRecencyScore(lastAccessedAt: string): number {
  const ageMs = Date.now() - new Date(lastAccessedAt).getTime();
  return Math.exp(-ageMs / RECENCY_HALF_LIFE_MS);
}

function computeFrequencyScore(accessCount: number): number {
  return Math.log2(accessCount + 1) / 10;
}

function bm25Score(
  queryTerms: string[],
  doc: IndexedDoc,
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

function splitFrontmatter(raw: string): { frontmatter: string; body: string } | null {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return null;
  return {
    frontmatter: match[1] ?? '',
    body: (match[2] ?? '').trim(),
  };
}

function mergeContent(existing: string, incoming: string): string {
  const lines = [...existing.split('\n'), ...incoming.split('\n')]
    .map((line) => line.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const line of lines) {
    const key = line.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(line.startsWith('- ') ? line : `- ${line}`);
  }
  return merged.join('\n');
}

function deriveTopic(content: string, keywords: string[]): string {
  const tokens = keywords.length > 0 ? keywords : tokenize(content).slice(0, 4);
  if (tokens.length === 0) return 'general-memory';
  return tokens.join('-');
}

function deriveKeywords(content: string, topic: string, tags: string[]): string[] {
  if (tags.length > 0) return uniq(tags);
  const candidates = tokenize(`${topic} ${content}`);
  return uniq(candidates).slice(0, 8);
}

function getTypeSectionHeader(type: MemoryType): string {
  if (type === 'semantic') return '## Facts & Preferences';
  if (type === 'episodic') return '## Past Experiences';
  return '## Behavioral Notes';
}

function normalizeEntry(entry: MemoryEntry): MemoryEntry {
  const topic = entry.topic?.trim() || deriveTopic(entry.content, entry.keywords ?? []);
  const keywords = uniq(entry.keywords ?? entry.tags ?? deriveKeywords(entry.content, topic, []));
  const tags = uniq(entry.tags ?? keywords);
  return {
    ...entry,
    topic,
    keywords,
    tags,
    title: entry.title?.trim() || topic.replace(/-/g, ' '),
  };
}

export class MemoryService {
  private readonly globalDir: string;
  private readonly projectDir: string | null;
  private readonly maxInjectionTokens: number;
  private readonly candidateLimit: number;
  private readonly workspaceId: string | undefined;
  private readonly indexPersisted: boolean;
  private readonly initPromise: Promise<void>;

  constructor(config: MemoryServiceConfig) {
    this.globalDir = path.join(config.globalDir, 'global');
    this.projectDir = config.projectDir ? path.join(config.projectDir, 'project') : null;
    this.maxInjectionTokens = config.maxInjectionTokens ?? 1200;
    this.candidateLimit = config.candidateLimit ?? 40;
    this.workspaceId = config.workspaceId;
    this.indexPersisted = config.indexPersisted ?? true;
    this.initPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    await this.ensureScopeDirs('global');
    if (this.projectDir) {
      await this.ensureScopeDirs('project');
    }
    await this.migrateLegacyJson('global');
    if (this.projectDir) {
      await this.migrateLegacyJson('project');
    }
    await this.rebuildIndexInternal('global', this.workspaceId, true);
    if (this.projectDir) {
      await this.rebuildIndexInternal('project', this.workspaceId, true);
    }
  }

  private async ensureReady(): Promise<void> {
    await this.initPromise;
  }

  private async ensureScopeDirs(scope: MemoryScope): Promise<void> {
    const baseDir = this.getScopeBaseDir(scope);
    if (!baseDir) return;
    await fs.mkdir(path.join(baseDir, 'topics'), { recursive: true });
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

  private async readTopicFile(filePath: string): Promise<MemoryEntry | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = splitFrontmatter(raw);
      if (!parsed) return null;
      const frontmatter = parseYaml(parsed.frontmatter) as Record<string, unknown>;
      const maybeKeywords = Array.isArray(frontmatter['keywords']) ? frontmatter['keywords'] : [];
      const maybeTags = Array.isArray(frontmatter['tags']) ? frontmatter['tags'] : [];
      const topic = String(frontmatter['topic'] ?? '').trim();
      const entry: MemoryEntry = {
        id: String(frontmatter['id'] ?? `mem_topic_${randomUUID()}`),
        topic: topic.length > 0 ? topic : path.basename(filePath, '.md'),
        title: typeof frontmatter['title'] === 'string' ? frontmatter['title'] : undefined,
        content: parsed.body,
        type: (frontmatter['type'] as MemoryType) ?? 'semantic',
        scope: (frontmatter['scope'] as MemoryScope) ?? 'global',
        tags: maybeTags.filter((value): value is string => typeof value === 'string'),
        keywords: maybeKeywords.filter((value): value is string => typeof value === 'string'),
        workspaceId: typeof frontmatter['workspaceId'] === 'string' ? frontmatter['workspaceId'] : undefined,
        createdAt: String(frontmatter['createdAt'] ?? nowIso()),
        updatedAt: String(frontmatter['updatedAt'] ?? nowIso()),
        accessCount: Number(frontmatter['accessCount'] ?? 0),
        lastAccessedAt: String(frontmatter['lastAccessedAt'] ?? nowIso()),
        source: (frontmatter['source'] as MemorySource) ?? 'explicit',
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
    await this.ensureScopeDirs(scope);
    const frontmatter = {
      id: entry.id,
      topic: entry.topic,
      title: entry.title ?? entry.topic.replace(/-/g, ' '),
      scope: entry.scope,
      ...(entry.workspaceId ? { workspaceId: entry.workspaceId } : {}),
      type: entry.type,
      keywords: uniq(entry.keywords),
      tags: uniq(entry.tags),
      source: entry.source,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      accessCount: entry.accessCount,
      lastAccessedAt: entry.lastAccessedAt,
      version: 1,
    };
    const frontmatterText = stringifyYaml(frontmatter).trim();
    const body = entry.content.trim();
    const text = `---\n${frontmatterText}\n---\n\n${body}\n`;
    await fs.writeFile(filePath, text, 'utf-8');
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

  private entryToIndexDoc(entry: MemoryEntry): IndexedDoc {
    const searchable = `${entry.topic} ${entry.title ?? ''} ${entry.keywords.join(' ')} ${entry.content}`;
    const tokens = tokenize(searchable);
    const terms = termFrequency(tokens);
    const docLen = Object.values(terms).reduce((sum, value) => sum + value, 0);
    return { entry, docLen, terms };
  }

  private async rebuildIndexInternal(scope: MemoryScope, workspaceId?: string, skipEnsureReady = false): Promise<void> {
    if (!skipEnsureReady) {
      await this.ensureReady();
    }
    const docs = await this.loadEntries(scope);
    const indexDocs: Record<string, IndexedDoc> = {};
    const df: Record<string, number> = {};
    let totalLen = 0;
    for (const entry of docs) {
      const normalized = normalizeEntry(entry);
      const docKey = toTopicSlug(normalized.topic);
      const indexedDoc = this.entryToIndexDoc(normalized);
      indexDocs[docKey] = indexedDoc;
      totalLen += indexedDoc.docLen;
      for (const term of Object.keys(indexedDoc.terms)) {
        df[term] = (df[term] ?? 0) + 1;
      }
    }
    const docCount = Object.keys(indexDocs).length;
    const index: ScopeIndex = {
      version: 1,
      scope,
      workspaceId: workspaceId ?? this.workspaceId,
      docCount,
      avgDocLen: docCount > 0 ? totalLen / docCount : 0,
      df,
      docs: indexDocs,
      updatedAt: nowIso(),
    };
    const indexFile = this.getScopeIndexFile(scope);
    if (indexFile && this.indexPersisted) {
      await this.ensureScopeDirs(scope);
      await fs.writeFile(indexFile, JSON.stringify(index, null, 2), 'utf-8');
    }
  }

  async rebuildIndex(scope: MemoryScope, workspaceId?: string): Promise<void> {
    await this.rebuildIndexInternal(scope, workspaceId, false);
  }

  private async loadIndex(scope: MemoryScope): Promise<ScopeIndex> {
    const indexFile = this.getScopeIndexFile(scope);
    if (indexFile && this.indexPersisted) {
      try {
        const text = await fs.readFile(indexFile, 'utf-8');
        const parsed = JSON.parse(text) as ScopeIndex;
        if (parsed && parsed.version === 1 && parsed.scope === scope && parsed.docs) {
          return parsed;
        }
      } catch {
        // Rebuild below
      }
    }

    const docs = await this.loadEntries(scope);
    const indexDocs: Record<string, IndexedDoc> = {};
    const df: Record<string, number> = {};
    let totalLen = 0;
    for (const entry of docs) {
      const normalized = normalizeEntry(entry);
      const docKey = toTopicSlug(normalized.topic);
      const indexedDoc = this.entryToIndexDoc(normalized);
      indexDocs[docKey] = indexedDoc;
      totalLen += indexedDoc.docLen;
      for (const term of Object.keys(indexedDoc.terms)) {
        df[term] = (df[term] ?? 0) + 1;
      }
    }
    const index: ScopeIndex = {
      version: 1,
      scope,
      workspaceId: this.workspaceId,
      docCount: Object.keys(indexDocs).length,
      avgDocLen: Object.keys(indexDocs).length > 0 ? totalLen / Object.keys(indexDocs).length : 0,
      df,
      docs: indexDocs,
      updatedAt: nowIso(),
    };
    if (indexFile && this.indexPersisted) {
      await this.ensureScopeDirs(scope);
      await fs.writeFile(indexFile, JSON.stringify(index, null, 2), 'utf-8');
    }
    return index;
  }

  private async migrateLegacyJson(scope: MemoryScope): Promise<void> {
    const baseDir = this.getScopeBaseDir(scope);
    if (!baseDir) return;
    const legacyFile = path.join(path.dirname(baseDir), 'memories.json');
    const topicFiles = await this.listTopicFiles(scope);
    if (topicFiles.length > 0) return;
    try {
      const text = await fs.readFile(legacyFile, 'utf-8');
      const parsed = JSON.parse(text) as unknown;
      if (!Array.isArray(parsed) || parsed.length === 0) return;
      for (const item of parsed) {
        if (!item || typeof item !== 'object') continue;
        const data = item as Partial<MemoryEntry>;
        if (typeof data.content !== 'string' || typeof data.type !== 'string') continue;
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
          true,
        );
      }
      const backupFile = `${legacyFile}.bak.${Date.now()}`;
      await fs.copyFile(legacyFile, backupFile);
    } catch {
      // Migration is best effort
    }
  }

  private async upsertTopicMemoryInternal(input: TopicMemoryInput, skipEnsureReady = false): Promise<MemoryEntry> {
    if (!skipEnsureReady) {
      await this.ensureReady();
    }
    const scope = input.scope;
    const topic = (input.topic?.trim() || deriveTopic(input.content, input.keywords ?? input.tags ?? [])).trim();
    const topicSlug = toTopicSlug(topic);
    const filePath = this.getTopicFilePath(scope, topicSlug);
    if (!filePath) {
      throw new Error(`Scope ${scope} is not configured`);
    }

    const existing = await this.readTopicFile(filePath);
    const timestamp = nowIso();
    const derivedKeywords = deriveKeywords(input.content, topic, input.tags ?? []);
    const keywords = uniq(input.keywords ?? derivedKeywords);
    const tags = uniq(input.tags ?? keywords);
    const updateMode: TopicUpdateMode = input.updateMode ?? 'merge';
    const mergedContent =
      existing && updateMode === 'merge' ? mergeContent(existing.content, input.content) : input.content.trim();

    const entry: MemoryEntry = normalizeEntry({
      id: existing?.id ?? `mem_topic_${randomUUID()}`,
      topic,
      title: input.title?.trim() || existing?.title || topic.replace(/-/g, ' '),
      content: mergedContent,
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
    await this.rebuildIndexInternal(scope, entry.workspaceId, skipEnsureReady);
    return entry;
  }

  async upsertTopicMemory(input: TopicMemoryInput): Promise<MemoryEntry> {
    return this.upsertTopicMemoryInternal(input, false);
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
      await this.rebuildIndex(scope, target.entry.workspaceId);
      return true;
    }
    return false;
  }

  async getAllMemories(): Promise<MemoryEntry[]> {
    await this.ensureReady();
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
    }
  }

  async searchMemories(options: SearchMemoryOptions): Promise<MemoryEntry[]> {
    await this.ensureReady();
    const scopes = options.scopes ?? (this.projectDir ? (['global', 'project'] as MemoryScope[]) : ['global']);
    const queryTerms = tokenize(options.query ?? '');
    const candidateLimit = options.candidateLimit ?? this.candidateLimit;

    const candidates: Array<{ entry: MemoryEntry; bm25: number }> = [];

    for (const scope of scopes) {
      if (scope === 'project' && !this.projectDir) continue;
      const index = await this.loadIndex(scope);
      let maxScore = 0;
      const scopedResults: Array<{ entry: MemoryEntry; bm25: number }> = [];
      for (const doc of Object.values(index.docs)) {
        if (
          doc.entry.scope === 'project' &&
          options.workspaceId &&
          doc.entry.workspaceId &&
          doc.entry.workspaceId !== options.workspaceId
        ) {
          continue;
        }
        const score = bm25Score(queryTerms, doc, index);
        maxScore = Math.max(maxScore, score);
        scopedResults.push({ entry: doc.entry, bm25: score });
      }
      for (const result of scopedResults) {
        const normalizedBm25 = maxScore > 0 ? result.bm25 / maxScore : 0;
        candidates.push({
          entry: result.entry,
          bm25: normalizedBm25,
        });
      }
    }

    const scored = candidates.map(({ entry, bm25 }) => {
      const recency = computeRecencyScore(entry.lastAccessedAt);
      const frequency = computeFrequencyScore(entry.accessCount);
      const typeWeight = TYPE_WEIGHTS[entry.type];
      const scopeBoost = entry.scope === 'project' ? 0.05 : 0;
      const fallbackBm25 = queryTerms.length === 0 ? 0.25 : bm25;
      const score = fallbackBm25 * 0.55 + recency * 0.2 + frequency * 0.1 + typeWeight * 0.1 + scopeBoost;
      return { entry, score };
    });

    scored.sort((a, b) => b.score - a.score);

    const byTopic = new Map<string, MemoryEntry>();
    for (const item of scored) {
      const key = toTopicSlug(item.entry.topic);
      const existing = byTopic.get(key);
      if (!existing) {
        byTopic.set(key, item.entry);
        continue;
      }
      if (existing.scope === 'global' && item.entry.scope === 'project') {
        byTopic.set(key, item.entry);
      }
    }

    return Array.from(byTopic.values()).slice(0, candidateLimit);
  }

  private async recordAccess(entry: MemoryEntry): Promise<void> {
    const scope = entry.scope;
    const topicSlug = toTopicSlug(entry.topic);
    const filePath = this.getTopicFilePath(scope, topicSlug);
    if (!filePath) return;
    const existing = await this.readTopicFile(filePath);
    if (!existing) return;
    const updatedEntry: MemoryEntry = {
      ...existing,
      accessCount: existing.accessCount + 1,
      lastAccessedAt: nowIso(),
      updatedAt: nowIso(),
    };
    await this.writeTopicFile(scope, updatedEntry);
    await this.rebuildIndex(scope, updatedEntry.workspaceId);
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
      const compactContent = entry.content.replace(/\s+/g, ' ').trim();
      const bullet = `- [${entry.scope}] ${entry.topic}: ${compactContent}`;
      const tokenCost = estimateTokens(bullet);
      if (usedTokens + tokenCost > injectTokenBudget) continue;
      grouped[entry.type].push(bullet);
      selected.push(entry);
      usedTokens += tokenCost;
    }

    if (selected.length === 0) return '';

    for (const entry of selected) {
      await this.recordAccess(entry);
    }

    const sections: string[] = [];
    for (const type of ['semantic', 'episodic', 'procedural'] as const) {
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
