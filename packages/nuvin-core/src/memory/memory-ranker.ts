import type { MemoryEntry, MemoryType } from './types.js';

// ── Constants ──────────────────────────────────────────────────────────────

/** Half-life of 7 days in milliseconds for exponential recency decay. */
const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;

/** Type-based importance weights. */
const TYPE_WEIGHTS: Record<MemoryType, number> = {
  semantic: 0.6,
  episodic: 0.3,
  procedural: 0.1,
};

/** Section headers for each memory type. */
const SECTION_HEADERS: Record<MemoryType, string> = {
  semantic: '## Facts & Preferences',
  episodic: '## Past Experiences',
  procedural: '## Behavioral Notes',
};

/** Canonical section rendering order. */
const SECTION_ORDER: MemoryType[] = ['semantic', 'episodic', 'procedural'];

// ── Scoring ────────────────────────────────────────────────────────────────

function computeRecencyScore(lastAccessedAt: string): number {
  const ageMs = Date.now() - new Date(lastAccessedAt).getTime();
  return Math.exp(-ageMs / RECENCY_HALF_LIFE_MS);
}

function computeFrequencyScore(accessCount: number): number {
  return Math.log2(accessCount + 1) / 10;
}

function scoreEntry(entry: MemoryEntry): number {
  const recencyScore = computeRecencyScore(entry.lastAccessedAt);
  const frequencyScore = computeFrequencyScore(entry.accessCount);
  const typeWeight = TYPE_WEIGHTS[entry.type];
  return recencyScore * 0.5 + frequencyScore * 0.3 + typeWeight * 0.2;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Ranks memory entries by a composite score combining recency, frequency, and
 * type importance. Returns entries sorted descending by score.
 *
 * Score formula: recencyScore * 0.5 + frequencyScore * 0.3 + typeWeight * 0.2
 */
export function rankMemories(entries: MemoryEntry[], limit?: number): MemoryEntry[] {
  const scored = entries
    .map(entry => ({ entry, score: scoreEntry(entry) }))
    .sort((a, b) => b.score - a.score);

  const ranked = scored.map(({ entry }) => entry);
  return limit !== undefined ? ranked.slice(0, limit) : ranked;
}

/**
 * Formats a list of memory entries into a prompt-ready markdown string.
 *
 * Groups entries by type under labelled section headers, ordered:
 * semantic → episodic → procedural. Each entry is rendered as a bullet.
 * Returns an empty string when entries is empty.
 */
export function formatMemoriesForPrompt(entries: MemoryEntry[]): string {
  if (entries.length === 0) return '';

  const grouped = new Map<MemoryType, MemoryEntry[]>();
  for (const entry of entries) {
    const bucket = grouped.get(entry.type) ?? [];
    bucket.push(entry);
    grouped.set(entry.type, bucket);
  }

  const sections: string[] = [];
  for (const type of SECTION_ORDER) {
    const bucket = grouped.get(type);
    if (!bucket || bucket.length === 0) continue;

    const header = SECTION_HEADERS[type];
    const bullets = bucket.map(e => `- ${e.content}`).join('\n');
    sections.push(`${header}\n${bullets}`);
  }

  return sections.join('\n\n');
}
