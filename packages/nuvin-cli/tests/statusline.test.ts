import { describe, it, expect } from 'vitest';
import { DEFAULT_STATUSLINE_ROWS } from '../source/components/Footer.js';
import type { StatuslineSegment } from '../source/config/types.js';

// ---------------------------------------------------------------------------
// Inline helper matching the private implementation in Footer.tsx
// ---------------------------------------------------------------------------
const ALL_SEGMENTS = [
  'session', 'thinking', 'sudo',
  'tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp',
  'gitBranch', 'keybindings',
] as const satisfies readonly StatuslineSegment[];

const getHidden = (rows: [StatuslineSegment[], StatuslineSegment[]]): StatuslineSegment[] =>
  ALL_SEGMENTS.filter(s => !rows[0].includes(s) && !rows[1].includes(s));

// ---------------------------------------------------------------------------
// Group 1: DEFAULT_STATUSLINE_ROWS structure
// ---------------------------------------------------------------------------
describe('DEFAULT_STATUSLINE_ROWS', () => {
  it('contains exactly 12 unique segments across both rows', () => {
    const all = [...DEFAULT_STATUSLINE_ROWS[0], ...DEFAULT_STATUSLINE_ROWS[1]];
    const unique = new Set(all);
    expect(all).toHaveLength(12);
    expect(unique.size).toBe(12);
  });

  it('has no segment appearing in both rows', () => {
    const row0Set = new Set(DEFAULT_STATUSLINE_ROWS[0]);
    const overlap = DEFAULT_STATUSLINE_ROWS[1].filter(s => row0Set.has(s));
    expect(overlap).toHaveLength(0);
  });

  it('row 0 has exactly 10 segments', () => {
    expect(DEFAULT_STATUSLINE_ROWS[0]).toHaveLength(10);
  });

  it('row 1 has exactly 2 segments', () => {
    expect(DEFAULT_STATUSLINE_ROWS[1]).toHaveLength(2);
  });

  it('row 0 contains the expected metric and status segments', () => {
    const row0 = DEFAULT_STATUSLINE_ROWS[0];
    const expected: StatuslineSegment[] = [
      'session', 'thinking', 'sudo',
      'tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp',
    ];
    expect([...row0].sort()).toEqual([...expected].sort());
  });

  it('row 1 contains gitBranch and keybindings', () => {
    const row1 = DEFAULT_STATUSLINE_ROWS[1];
    const expected: StatuslineSegment[] = ['gitBranch', 'keybindings'];
    expect([...row1].sort()).toEqual([...expected].sort());
  });

  it('row 0 segments appear in the correct order (session first, lsp last)', () => {
    const row0 = DEFAULT_STATUSLINE_ROWS[0];
    expect(row0[0]).toBe<StatuslineSegment>('session');
    expect(row0[row0.length - 1]).toBe<StatuslineSegment>('lsp');
  });
});

// ---------------------------------------------------------------------------
// Group 2: getHidden logic
// ---------------------------------------------------------------------------
describe('getHidden', () => {
  it('returns empty array when all segments are in the rows', () => {
    expect(getHidden(DEFAULT_STATUSLINE_ROWS)).toEqual([]);
  });

  it('returns all 12 segments when both rows are empty', () => {
    const hidden = getHidden([[], []]);
    expect(hidden).toHaveLength(12);
    expect([...hidden].sort()).toEqual([...ALL_SEGMENTS].sort());
  });

  it('returns 11 segments not including tokens when only tokens is in row 0', () => {
    const hidden = getHidden([['tokens'], []]);
    expect(hidden).toHaveLength(11);
    expect(hidden).not.toContain('tokens');
  });

  it('moving a segment from row 0 to row 1 does not change the hidden count', () => {
    // Build a full layout then move 'lsp' from row 0 to row 1
    const row0: StatuslineSegment[] = DEFAULT_STATUSLINE_ROWS[0].filter(s => s !== 'lsp');
    const row1: StatuslineSegment[] = [...DEFAULT_STATUSLINE_ROWS[1], 'lsp'];
    const hiddenBefore = getHidden(DEFAULT_STATUSLINE_ROWS).length;
    const hiddenAfter = getHidden([row0, row1]).length;
    expect(hiddenAfter).toBe(hiddenBefore);
  });

  it('hidden + row0 + row1 covers ALL_SEGMENTS with no orphans and no duplicates', () => {
    const rows: [StatuslineSegment[], StatuslineSegment[]] = [
      ['session', 'thinking', 'tokens'],
      ['gitBranch'],
    ];
    const hidden = getHidden(rows);
    const combined = [...hidden, ...rows[0], ...rows[1]];
    expect(combined).toHaveLength(ALL_SEGMENTS.length);
    expect(new Set(combined).size).toBe(ALL_SEGMENTS.length);
    expect([...combined].sort()).toEqual([...ALL_SEGMENTS].sort());
  });
});

// ---------------------------------------------------------------------------
// Group 3: StatuslineConfig type shape (compile-time assignability check)
// ---------------------------------------------------------------------------
describe('StatuslineConfig type shape', () => {
  it('DEFAULT_STATUSLINE_ROWS is assignable to [StatuslineSegment[], StatuslineSegment[]]', () => {
    // If this compiles, the type contract is satisfied. We also do a runtime sanity check.
    const rows: [StatuslineSegment[], StatuslineSegment[]] = DEFAULT_STATUSLINE_ROWS;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(2);
    expect(Array.isArray(rows[0])).toBe(true);
    expect(Array.isArray(rows[1])).toBe(true);
  });
});
