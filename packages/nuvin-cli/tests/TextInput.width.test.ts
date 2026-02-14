import { describe, expect, it } from 'vitest';
import {
  computeEffectiveWidth,
  stabilizeEffectiveWidth,
  resolveRenderedCursorColumn,
} from '../source/components/TextInput/TextInput.js';

describe('TextInput width calculation', () => {
  it('falls back to terminal width when measured width is tiny', () => {
    const width = computeEffectiveWidth({
      measuredContainerWidth: 4,
      terminalCols: 80,
      showScrollbar: true,
      maxLines: 10,
    });

    // Should not wrap a short word like "test" into "te\nst"
    expect(width).toBeGreaterThan(4);
  });

  it('uses measured width when it is larger than fallback', () => {
    const width = computeEffectiveWidth({
      measuredContainerWidth: 120,
      terminalCols: 80,
      showScrollbar: false,
      maxLines: 10,
    });

    expect(width).toBe(118);
  });

  it('keeps a minimum width of 1', () => {
    const width = computeEffectiveWidth({
      measuredContainerWidth: 0,
      terminalCols: 3,
      showScrollbar: true,
      maxLines: 10,
    });

    expect(width).toBe(1);
  });
});

describe('TextInput width stabilization', () => {
  it('ignores suspicious tiny collapse when terminal cols did not change', () => {
    const stable = stabilizeEffectiveWidth({
      previousEffectiveWidth: 74,
      nextEffectiveWidth: 2,
      terminalColsChanged: false,
    });

    expect(stable).toBe(74);
  });

  it('accepts tiny width when terminal cols changed', () => {
    const stable = stabilizeEffectiveWidth({
      previousEffectiveWidth: 74,
      nextEffectiveWidth: 2,
      terminalColsChanged: true,
    });

    expect(stable).toBe(2);
  });

  it('accepts regular shrink when collapse is not suspicious', () => {
    const stable = stabilizeEffectiveWidth({
      previousEffectiveWidth: 74,
      nextEffectiveWidth: 36,
      terminalColsChanged: false,
    });

    expect(stable).toBe(36);
  });
});

describe('TextInput cursor rendering at end of row', () => {
  it('pins cursor to last visible character when logical cursor is at end of non-empty row', () => {
    const renderedColumn = resolveRenderedCursorColumn(6, 6);

    expect(renderedColumn).toBe(5);
  });

  it('keeps cursor at start for empty rows', () => {
    const renderedColumn = resolveRenderedCursorColumn(0, 0);

    expect(renderedColumn).toBe(0);
  });

  it('keeps cursor column when it is already inside row bounds', () => {
    const renderedColumn = resolveRenderedCursorColumn(3, 6);

    expect(renderedColumn).toBe(3);
  });
});
