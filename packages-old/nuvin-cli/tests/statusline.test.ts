import { describe, it, expect } from 'vitest';
import { DEFAULT_STATUSLINE_ROWS } from '../source/components/Footer.js';
import type { StatuslineSegment, StatuslineRow } from '../source/config/types.js';

// ---------------------------------------------------------------------------
// Inline helper matching the private implementation in Footer.tsx
// ---------------------------------------------------------------------------
const ALL_SEGMENTS = [
  'model',
  'session', 'thinking', 'sudo',
  'tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp',
  'gitBranch', 'keybindings',
] as const satisfies readonly StatuslineSegment[];

const onlySegments = (row: StatuslineRow): StatuslineSegment[] =>
  row.filter((s): s is StatuslineSegment => s !== '|');

const getHidden = (rows: [StatuslineRow, StatuslineRow]): StatuslineSegment[] =>
  ALL_SEGMENTS.filter((s) => !rows[0].includes(s) && !rows[1].includes(s));

// ---------------------------------------------------------------------------
// Group 1: DEFAULT_STATUSLINE_ROWS structure
// ---------------------------------------------------------------------------
describe('DEFAULT_STATUSLINE_ROWS', () => {
  it('contains exactly 13 unique segments across both rows (excluding | separators)', () => {
    const allSegs = [...onlySegments(DEFAULT_STATUSLINE_ROWS[0]), ...onlySegments(DEFAULT_STATUSLINE_ROWS[1])];
    const unique = new Set(allSegs);
    expect(allSegs).toHaveLength(13);
    expect(unique.size).toBe(13);
  });

  it('has no segment appearing in both rows', () => {
    const row0Set = new Set(onlySegments(DEFAULT_STATUSLINE_ROWS[0]));
    const overlap = onlySegments(DEFAULT_STATUSLINE_ROWS[1]).filter((s) => row0Set.has(s));
    expect(overlap).toHaveLength(0);
  });

  it('row 0 contains exactly one | separator', () => {
    const seps = DEFAULT_STATUSLINE_ROWS[0].filter((s) => s === '|');
    expect(seps).toHaveLength(1);
  });

  it('row 1 contains exactly one | separator', () => {
    const seps = DEFAULT_STATUSLINE_ROWS[1].filter((s) => s === '|');
    expect(seps).toHaveLength(1);
  });

  it('row 0 has exactly 11 segments (excluding |)', () => {
    expect(onlySegments(DEFAULT_STATUSLINE_ROWS[0])).toHaveLength(11);
  });

  it('row 1 has exactly 2 segments (excluding |)', () => {
    expect(onlySegments(DEFAULT_STATUSLINE_ROWS[1])).toHaveLength(2);
  });

  it('row 0 contains the expected metric and status segments', () => {
    const row0Segs = onlySegments(DEFAULT_STATUSLINE_ROWS[0]);
    const expected: StatuslineSegment[] = [
      'model', 'session', 'thinking', 'sudo',
      'tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp',
    ];
    expect([...row0Segs].sort()).toEqual([...expected].sort());
  });

  it('row 1 contains gitBranch and keybindings', () => {
    const row1Segs = onlySegments(DEFAULT_STATUSLINE_ROWS[1]);
    const expected: StatuslineSegment[] = ['gitBranch', 'keybindings'];
    expect([...row1Segs].sort()).toEqual([...expected].sort());
  });

  it('| separator appears after sudo (left group) and before tokens (right group) in row 0', () => {
    const row0 = DEFAULT_STATUSLINE_ROWS[0];
    const sepIdx = row0.indexOf('|');
    expect(sepIdx).toBeGreaterThan(0);
    expect(row0[sepIdx - 1]).toBe<string>('sudo');
    expect(row0[sepIdx + 1]).toBe<string>('tokens');
  });

  it('row 0 first segment is model, last segment is lsp', () => {
    const row0 = DEFAULT_STATUSLINE_ROWS[0];
    expect(row0[0]).toBe<string>('model');
    expect(row0[row0.length - 1]).toBe<string>('lsp');
  });
});

// ---------------------------------------------------------------------------
// Group 2: getHidden logic
// ---------------------------------------------------------------------------
describe('getHidden', () => {
  it('returns empty array when all segments are in the rows', () => {
    expect(getHidden(DEFAULT_STATUSLINE_ROWS)).toEqual([]);
  });

  it('returns all 13 segments when both rows are empty', () => {
    const hidden = getHidden([[], []]);
    expect(hidden).toHaveLength(13);
    expect([...hidden].sort()).toEqual([...ALL_SEGMENTS].sort());
  });

  it('returns 12 segments not including tokens when only tokens is in row 0', () => {
    const hidden = getHidden([['tokens'], []]);
    expect(hidden).toHaveLength(12);
    expect(hidden).not.toContain('tokens');
  });

  it('| separator is not counted as a segment in getHidden', () => {
    const hidden = getHidden([['|'], ['|']]);
    expect(hidden).toHaveLength(13); // all 13 segments still hidden
    expect(hidden).not.toContain('|');
  });

  it('moving a segment from row 0 to row 1 does not change the hidden count', () => {
    const row0 = DEFAULT_STATUSLINE_ROWS[0].filter((s) => s !== 'lsp') as StatuslineRow;
    const row1: StatuslineRow = [...DEFAULT_STATUSLINE_ROWS[1], 'lsp'];
    const hiddenBefore = getHidden(DEFAULT_STATUSLINE_ROWS).length;
    const hiddenAfter = getHidden([row0, row1]).length;
    expect(hiddenAfter).toBe(hiddenBefore);
  });

  it('hidden + row0 segs + row1 segs covers ALL_SEGMENTS with no orphans and no duplicates', () => {
    const rows: [StatuslineRow, StatuslineRow] = [
      ['session', 'thinking', 'tokens', '|'],
      ['gitBranch'],
    ];
    const hidden = getHidden(rows);
    const combined = [...hidden, ...onlySegments(rows[0]), ...onlySegments(rows[1])];
    expect(combined).toHaveLength(ALL_SEGMENTS.length);
    expect(new Set(combined).size).toBe(ALL_SEGMENTS.length);
    expect([...combined].sort()).toEqual([...ALL_SEGMENTS].sort());
  });
});

// ---------------------------------------------------------------------------
// Group 3: StatuslineConfig type shape
// ---------------------------------------------------------------------------
describe('StatuslineConfig type shape', () => {
  it('DEFAULT_STATUSLINE_ROWS is assignable to [StatuslineRow, StatuslineRow]', () => {
    const rows: [StatuslineRow, StatuslineRow] = DEFAULT_STATUSLINE_ROWS;
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toHaveLength(2);
    expect(Array.isArray(rows[0])).toBe(true);
    expect(Array.isArray(rows[1])).toBe(true);
  });

  it('each row can contain | alongside segments', () => {
    const row: StatuslineRow = ['model', '|', 'tokens'];
    expect(row).toContain('|');
    expect(row).toContain('model');
    expect(row).toContain('tokens');
  });
});
