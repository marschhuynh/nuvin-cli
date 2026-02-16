import stringWidth from 'string-width';

export function computeEffectiveWidth({
  measuredContainerWidth,
  terminalCols,
  showScrollbar,
  maxLines,
}: {
  measuredContainerWidth: number | undefined;
  terminalCols: number;
  showScrollbar: boolean;
  maxLines: number | undefined;
}): number {
  // Keep a conservative fallback based on terminal width to avoid tiny
  // measured widths causing pathological wrapping of short pasted text.
  const fallbackContainerWidth = Math.max(1, terminalCols - 4);
  const baseContainerWidth = Math.max(measuredContainerWidth ?? 0, fallbackContainerWidth);
  const scrollbarWidth = showScrollbar && maxLines !== undefined ? 1 : 0;
  return Math.max(1, baseContainerWidth - scrollbarWidth - 2);
}

export function stabilizeEffectiveWidth({
  previousEffectiveWidth,
  nextEffectiveWidth,
  terminalColsChanged,
}: {
  previousEffectiveWidth: number | undefined;
  nextEffectiveWidth: number;
  terminalColsChanged: boolean;
}): number {
  if (previousEffectiveWidth === undefined || terminalColsChanged) {
    return nextEffectiveWidth;
  }

  const collapsedTooFar = nextEffectiveWidth < Math.floor(previousEffectiveWidth * 0.35);
  const suspiciousTinyWidth = nextEffectiveWidth < 12;

  // Ignore transient tiny collapses (for example, width briefly measured as 1-2)
  // when terminal columns did not actually change.
  if (collapsedTooFar && suspiciousTinyWidth) {
    return previousEffectiveWidth;
  }

  return nextEffectiveWidth;
}

export function resolveRenderedCursorColumn(rawCursorColInRow: number, _rowTextLength: number, _isFullLine: boolean): number {
  return rawCursorColInRow;
}

/**
 * Split a string into visual-width-aware chunks that fit within maxWidth terminal columns.
 * Returns an array of { text, charStart, charEnd } for each chunk.
 */
export function splitByVisualWidth(
  line: string,
  maxWidth: number,
): Array<{ text: string; charStart: number; charEnd: number }> {
  if (line.length === 0) {
    return [{ text: '', charStart: 0, charEnd: 0 }];
  }

  const chars = [...line];
  const chunks: Array<{ text: string; charStart: number; charEnd: number }> = [];
  let chunkStart = 0;
  let currentWidth = 0;
  let charIndex = 0;

  for (let i = 0; i < chars.length; i++) {
    const charW = stringWidth(chars[i]!);
    if (currentWidth + charW > maxWidth && currentWidth > 0) {
      chunks.push({
        text: chars.slice(chunkStart, i).join(''),
        charStart: charIndex - (i - chunkStart),
        charEnd: charIndex,
      });
      chunkStart = i;
      currentWidth = 0;
    }
    currentWidth += charW;
    charIndex++;
  }

  // Remaining characters
  if (chunkStart < chars.length) {
    const text = chars.slice(chunkStart).join('');
    const startCharIdx = chars.slice(0, chunkStart).join('').length;
    chunks.push({
      text,
      charStart: startCharIdx,
      charEnd: startCharIdx + text.length,
    });
  }

  return chunks;
}

/**
 * Given a character column within a line, compute:
 * - which visual row it falls on (when the line is wrapped at maxWidth)
 * - the character offset within that visual row (for slicing)
 */
export function charColToVisualPosition(
  line: string,
  charCol: number,
  maxWidth: number,
): { visualRowInLine: number; charColInRow: number } {
  const chunks = splitByVisualWidth(line, maxWidth);

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    if (charCol >= chunk.charStart && charCol <= chunk.charEnd) {
      // If charCol is at the end of a chunk AND there's a next chunk,
      // and charCol equals the start of the next chunk, place it in the next chunk
      if (charCol === chunk.charEnd && i + 1 < chunks.length && charCol === chunks[i + 1]!.charStart) {
        return { visualRowInLine: i + 1, charColInRow: 0 };
      }
      return { visualRowInLine: i, charColInRow: charCol - chunk.charStart };
    }
  }

  // Fallback: cursor at end of last chunk
  const lastChunk = chunks[chunks.length - 1]!;
  return { visualRowInLine: chunks.length - 1, charColInRow: charCol - lastChunk.charStart };
}

/**
 * Count how many visual rows a line occupies when wrapped at maxWidth.
 */
export function countVisualRows(line: string, maxWidth: number): number {
  if (line.length === 0) return 1;
  const w = stringWidth(line);
  if (w === 0) return 1;
  return splitByVisualWidth(line, maxWidth).length;
}
