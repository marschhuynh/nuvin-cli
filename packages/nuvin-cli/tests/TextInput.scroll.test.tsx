import { describe, it, expect } from 'vitest';
import { getLineInfo, moveCursorVisually } from '../source/utils/textNavigation.js';

describe('TextInput Scroll and Visual Navigation', () => {
  describe('word wrapping', () => {
    function wrapLine(line: string, width: number): Array<{ text: string; startCol: number; endCol: number }> {
      if (line.length <= width) {
        return [{ text: line, startCol: 0, endCol: line.length }];
      }

      const result: Array<{ text: string; startCol: number; endCol: number }> = [];
      let pos = 0;

      while (pos < line.length) {
        if (pos + width >= line.length) {
          result.push({ text: line.slice(pos), startCol: pos, endCol: line.length });
          break;
        }

        let breakPoint = pos + width;
        let foundBreak = false;

        for (let i = pos + width; i > pos; i--) {
          if (line[i] === ' ') {
            breakPoint = i + 1;
            foundBreak = true;
            break;
          }
        }

        if (!foundBreak) {
          for (let i = pos + width; i > pos; i--) {
            const char = line[i];
            if (char === '-' || char === '/' || char === '\\' || char === '.' || char === ',') {
              breakPoint = i + 1;
              foundBreak = true;
              break;
            }
          }
        }

        if (!foundBreak) {
          breakPoint = pos + width;
        }

        // Orphan prevention: if next segment would be short, pull back
        if (foundBreak) {
          let nextPos = breakPoint;
          while (nextPos < line.length && line[nextPos] === ' ') {
            nextPos++;
          }
          const nextSpace = line.indexOf(' ', nextPos);
          const firstWordLength = nextSpace === -1 ? line.length - nextPos : nextSpace - nextPos;
          
          if (firstWordLength > 0 && firstWordLength < 15) {
            const remainingLength = line.length - nextPos;
            if (remainingLength > width && firstWordLength < width * 0.3) {
              for (let i = breakPoint - 2; i > pos + Math.floor(width * 0.5); i--) {
                if (line[i] === ' ') {
                  breakPoint = i + 1;
                  break;
                }
              }
            }
          }
        }

        const rowText = line.slice(pos, breakPoint);
        result.push({ text: rowText, startCol: pos, endCol: breakPoint });
        pos = breakPoint;

        while (pos < line.length && line[pos] === ' ') {
          pos++;
        }
      }

      return result;
    }

    it('should wrap at word boundaries', () => {
      const text = 'Hello World this is a test';
      const width = 12;

      const rows = wrapLine(text, width);

      // Should create multiple rows
      expect(rows.length).toBeGreaterThanOrEqual(2);
      
      // Verify all text is captured
      const combined = rows.map(r => r.text).join('');
      expect(combined.replace(/\s+/g, ' ').trim()).toBe(text.replace(/\s+/g, ' ').trim());
    });

    it('should preserve names like Nadella', () => {
      const text = 'Microsoft Chairman and CEO Satya Nadella, and NVIDIA founder';
      const width = 40;

      const rows = wrapLine(text, width);

      // "Nadella" should not be split
      for (const row of rows) {
        expect(row.text).not.toMatch(/Nadel$/);
        expect(row.text).not.toMatch(/^la,/);
      }
    });

    it('should preserve word partnerships', () => {
      const text = 'gathered to discuss the new partnerships:';
      const width = 30;

      const rows = wrapLine(text, width);

      // "partnerships" should not be split
      for (const row of rows) {
        expect(row.text).not.toMatch(/partnersh$/);
        expect(row.text).not.toMatch(/^ips:/);
      }
    });

    it('should hard-wrap very long words that exceed width', () => {
      const text = 'Supercalifragilisticexpialidocious is a word';
      const width = 15;

      const rows = wrapLine(text, width);

      // First row should be exactly 15 chars (hard wrap)
      expect(rows[0].text.length).toBe(15);
      expect(rows[0].text).toBe('Supercalifragil');
    });

    it('should handle the $10 billion text correctly', () => {
      const text = 'As part of the partnership, NVIDIA and Microsoft are committing to invest up to $10 billion and up to $5 billion respectively in Anthropic.';
      const width = 90;

      const rows = wrapLine(text, width);

      // "$10" should not be split from "billion"
      // Check no row ends with just "$"
      for (const row of rows) {
        expect(row.text.trimEnd()).not.toMatch(/\$$/);
      }
    });

    it('should not create orphan lines with single short words', () => {
      // This text at width 80 was creating "only" on its own line
      const text = 'Claude Opus 4.1, and Claude Haiku 4.5. This partnership will make Claude the only frontier model available on all three';
      const width = 85;

      const rows = wrapLine(text, width);

      // No row should be just "only " or similar short orphan
      for (const row of rows) {
        const trimmed = row.text.trim();
        if (trimmed.length > 0) {
          expect(trimmed.length).toBeGreaterThan(10);
        }
      }
    });
  });

  describe('cursorInfo calculation (hard wrap - legacy tests)', () => {
    const effectiveWidth = 20;

    function calculateCursorInfo(value: string, cursorOffset: number, width: number) {
      const lines = value.split('\n');
      const info = getLineInfo(value, cursorOffset);
      const logicalRow = info.lineIndex;
      const logicalCol = info.column;

      let visualRow = 0;
      for (let i = 0; i < logicalRow; i++) {
        const lineLen = lines[i]?.length ?? 0;
        visualRow += Math.max(1, Math.ceil(lineLen / width));
      }

      const currentLineLen = lines[logicalRow]?.length ?? 0;
      const numRowsForCurrentLine = Math.max(1, Math.ceil(currentLineLen / width));
      const maxRowIndexInLine = numRowsForCurrentLine - 1;

      let wrappedRowInLine = currentLineLen > 0
        ? Math.floor(logicalCol / width)
        : 0;
      wrappedRowInLine = Math.min(wrappedRowInLine, maxRowIndexInLine);

      visualRow += wrappedRowInLine;

      const rowStartCol = wrappedRowInLine * width;
      const visualCol = logicalCol - rowStartCol;

      return { logicalRow, logicalCol, visualRow, visualCol };
    }

    function calculateVisualRows(value: string, width: number) {
      const lines = value.split('\n');
      const rows: Array<{ text: string; logicalLine: number }> = [];

      for (let logicalIndex = 0; logicalIndex < lines.length; logicalIndex++) {
        const line = lines[logicalIndex] ?? '';
        if (line.length === 0) {
          rows.push({ text: '', logicalLine: logicalIndex });
        } else {
          for (let i = 0; i < line.length; i += width) {
            rows.push({
              text: line.slice(i, i + width),
              logicalLine: logicalIndex,
            });
          }
        }
      }
      return rows;
    }

    it('should handle cursor at end of line exactly at wrap width', () => {
      const line = 'A'.repeat(20); // Exactly 20 chars
      const cursorOffset = 20; // Cursor after last char

      const visualRows = calculateVisualRows(line, effectiveWidth);
      const cursorInfo = calculateCursorInfo(line, cursorOffset, effectiveWidth);

      // Should have 1 visual row
      expect(visualRows.length).toBe(1);
      expect(visualRows[0].text).toBe(line);

      // Cursor should be on row 0, column 20 (at the end)
      expect(cursorInfo.visualRow).toBe(0);
      expect(cursorInfo.visualCol).toBe(20);

      // visualRow should be within bounds
      expect(cursorInfo.visualRow).toBeLessThan(visualRows.length);
    });

    it('should handle cursor at end of line that is multiple of wrap width', () => {
      const line = 'A'.repeat(40); // 40 chars = 2 rows
      const cursorOffset = 40; // Cursor after last char

      const visualRows = calculateVisualRows(line, effectiveWidth);
      const cursorInfo = calculateCursorInfo(line, cursorOffset, effectiveWidth);

      // Should have 2 visual rows
      expect(visualRows.length).toBe(2);

      // Cursor should be on row 1 (last row), column 20 (at the end)
      expect(cursorInfo.visualRow).toBe(1);
      expect(cursorInfo.visualCol).toBe(20);

      // visualRow should be within bounds
      expect(cursorInfo.visualRow).toBeLessThan(visualRows.length);
    });

    it('should handle cursor in middle of wrapped line', () => {
      const line = 'A'.repeat(50); // 50 chars = 3 rows
      const cursorOffset = 25; // Middle of second row

      const visualRows = calculateVisualRows(line, effectiveWidth);
      const cursorInfo = calculateCursorInfo(line, cursorOffset, effectiveWidth);

      // Should have 3 visual rows
      expect(visualRows.length).toBe(3);

      // Cursor should be on row 1, column 5
      expect(cursorInfo.visualRow).toBe(1);
      expect(cursorInfo.visualCol).toBe(5);
    });

    it('should handle multi-line content with wrapped lines', () => {
      const content = [
        'A'.repeat(50), // 3 visual rows
        'B'.repeat(30), // 2 visual rows
        'C'.repeat(10), // 1 visual row
      ].join('\n');
      // Total: 6 visual rows

      const visualRows = calculateVisualRows(content, effectiveWidth);
      expect(visualRows.length).toBe(6);

      // Cursor at start of last line
      const lastLineStart = 50 + 1 + 30 + 1; // 82
      const cursorInfo = calculateCursorInfo(content, lastLineStart, effectiveWidth);

      expect(cursorInfo.logicalRow).toBe(2);
      expect(cursorInfo.visualRow).toBe(5); // 3 + 2 = 5 (0-indexed)
      expect(cursorInfo.visualCol).toBe(0);
    });

    it('should handle cursor at very end of multi-line content', () => {
      const content = [
        'A'.repeat(50), // 3 visual rows
        'B'.repeat(30), // 2 visual rows
        'C'.repeat(10), // 1 visual row
      ].join('\n');

      const visualRows = calculateVisualRows(content, effectiveWidth);
      const cursorOffset = content.length; // At the very end

      const cursorInfo = calculateCursorInfo(content, cursorOffset, effectiveWidth);

      // Cursor should be on last visual row
      expect(cursorInfo.visualRow).toBe(5);
      expect(cursorInfo.visualCol).toBe(10);

      // Should be within bounds
      expect(cursorInfo.visualRow).toBeLessThan(visualRows.length);
    });

    it('should handle empty lines', () => {
      const content = 'Line1\n\nLine3';

      const visualRows = calculateVisualRows(content, effectiveWidth);
      expect(visualRows.length).toBe(3);

      // Cursor on empty line
      const cursorOffset = 6; // After first \n
      const cursorInfo = calculateCursorInfo(content, cursorOffset, effectiveWidth);

      expect(cursorInfo.logicalRow).toBe(1);
      expect(cursorInfo.visualRow).toBe(1);
      expect(cursorInfo.visualCol).toBe(0);
    });
  });

  describe('moveCursorVisually', () => {
    const wrapWidth = 20;

    it('should move up within wrapped line', () => {
      const line = 'A'.repeat(50); // 3 visual rows
      const cursorOffset = 25; // Row 1, col 5

      const result = moveCursorVisually(line, cursorOffset, 'up', wrapWidth);

      // Should move to row 0, col 5
      expect(result).toBe(5);
    });

    it('should move down within wrapped line', () => {
      const line = 'A'.repeat(50); // 3 visual rows
      const cursorOffset = 5; // Row 0, col 5

      const result = moveCursorVisually(line, cursorOffset, 'down', wrapWidth);

      // Should move to row 1, col 5
      expect(result).toBe(25);
    });

    it('should move up from first row of wrapped line to previous logical line', () => {
      const content = `First line\n${'A'.repeat(50)}`;
      const cursorOffset = 11 + 5; // Second logical line, row 0, col 5

      const result = moveCursorVisually(content, cursorOffset, 'up', wrapWidth);

      // Should move to first line, col 5
      expect(result).toBe(5);
    });

    it('should move down from last row of wrapped line to next logical line', () => {
      const content = `${'A'.repeat(50)}\nSecond line`;
      const cursorOffset = 45; // First line, row 2, col 5

      const result = moveCursorVisually(content, cursorOffset, 'down', wrapWidth);

      // Should move to second line, col 5
      expect(result).toBe(51 + 5);
    });

    it('should return null when moving up from first line', () => {
      const content = 'A'.repeat(50);
      const cursorOffset = 5; // Row 0, col 5

      const result = moveCursorVisually(content, cursorOffset, 'up', wrapWidth);

      expect(result).toBeNull();
    });

    it('should return null when moving down from last line', () => {
      const content = 'A'.repeat(50);
      const cursorOffset = 45; // Row 2, col 5

      const result = moveCursorVisually(content, cursorOffset, 'down', wrapWidth);

      expect(result).toBeNull();
    });

    it('should handle cursor at end of row (exactly at wrap width)', () => {
      const line = 'A'.repeat(40); // 2 visual rows
      const cursorOffset = 20; // Start of row 1

      // Cursor at position 20 is on row 1 (the last row for 40-char content)
      // Moving down should return null since there's no next row
      const downResult = moveCursorVisually(line, cursorOffset, 'down', wrapWidth);
      expect(downResult).toBeNull();

      // Moving up should go to row 0
      const upResult = moveCursorVisually(line, cursorOffset, 'up', wrapWidth);
      expect(upResult).toBe(0); // Row 0, col 0 (visualColInRow=0, clamped)
    });

    it('should handle cursor at very end of content (multiple of width)', () => {
      const line = 'A'.repeat(40); // 2 rows, cursor at position 40
      const cursorOffset = 40;

      // Should be on row 1, so moving up should go to row 0
      const result = moveCursorVisually(line, cursorOffset, 'up', wrapWidth);

      // Should move to row 0, clamped to valid position
      expect(result).not.toBeNull();
      expect(result).toBeLessThanOrEqual(20);
    });

    it('should clamp column when target row is shorter', () => {
      const content = `${'A'.repeat(50)}\nShort`;
      const cursorOffset = 45; // First line, row 2, col 5

      const result = moveCursorVisually(content, cursorOffset, 'down', wrapWidth);

      // "Short" is only 5 chars, so col 5 should clamp to 5
      expect(result).toBe(51 + 5);
    });

    it('should preserve column when moving through wrapped rows', () => {
      const line = 'A'.repeat(60); // 3 visual rows
      const startOffset = 5; // Row 0, col 5

      // Move down twice
      const down1 = moveCursorVisually(line, startOffset, 'down', wrapWidth);
      expect(down1).toBe(25); // Row 1, col 5

      const down2 = moveCursorVisually(line, down1, 'down', wrapWidth);
      expect(down2).toBe(45); // Row 2, col 5

      // Move back up twice
      const up1 = moveCursorVisually(line, down2, 'up', wrapWidth);
      expect(up1).toBe(25); // Row 1, col 5

      const up2 = moveCursorVisually(line, up1, 'up', wrapWidth);
      expect(up2).toBe(5); // Row 0, col 5
    });
  });

  describe('scroll offset calculation', () => {
    function calculateScrollOffset(
      visualRow: number,
      visualLineCount: number,
      visibleLines: number,
      currentScrollOffset: number
    ): number {
      const maxScroll = Math.max(0, visualLineCount - visibleLines);

      if (visualRow < currentScrollOffset) {
        return Math.max(0, visualRow);
      } else if (visualRow >= currentScrollOffset + visibleLines) {
        return Math.min(maxScroll, visualRow - visibleLines + 1);
      } else if (currentScrollOffset > maxScroll) {
        return maxScroll;
      }
      return currentScrollOffset;
    }

    it('should scroll to show cursor at bottom when pasting long content', () => {
      const visualLineCount = 25;
      const visibleLines = 5;
      const cursorVisualRow = 24; // Last row (0-indexed)
      const currentScrollOffset = 0;

      const newOffset = calculateScrollOffset(
        cursorVisualRow,
        visualLineCount,
        visibleLines,
        currentScrollOffset
      );

      // Should scroll so that row 24 is visible (rows 20-24)
      expect(newOffset).toBe(20);

      // Verify cursor is in visible range
      expect(cursorVisualRow).toBeGreaterThanOrEqual(newOffset);
      expect(cursorVisualRow).toBeLessThan(newOffset + visibleLines);
    });

    it('should scroll up when cursor moves above visible area', () => {
      const visualLineCount = 25;
      const visibleLines = 5;
      const cursorVisualRow = 5;
      const currentScrollOffset = 10; // Currently showing rows 10-14

      const newOffset = calculateScrollOffset(
        cursorVisualRow,
        visualLineCount,
        visibleLines,
        currentScrollOffset
      );

      // Should scroll to show row 5 at top
      expect(newOffset).toBe(5);
    });

    it('should not scroll when cursor is already visible', () => {
      const visualLineCount = 25;
      const visibleLines = 5;
      const cursorVisualRow = 12;
      const currentScrollOffset = 10; // Currently showing rows 10-14

      const newOffset = calculateScrollOffset(
        cursorVisualRow,
        visualLineCount,
        visibleLines,
        currentScrollOffset
      );

      // Should not change
      expect(newOffset).toBe(10);
    });

    it('should handle scroll offset exceeding max after content deletion', () => {
      const visualLineCount = 10; // Content was reduced
      const visibleLines = 5;
      const cursorVisualRow = 8;
      const currentScrollOffset = 15; // Invalid - was set when content was longer

      const newOffset = calculateScrollOffset(
        cursorVisualRow,
        visualLineCount,
        visibleLines,
        currentScrollOffset
      );

      // Cursor at row 8 with 10 lines and 5 visible
      // maxScroll = 10 - 5 = 5
      // But cursor (8) >= currentScrollOffset (15) + visibleLines (5) = 20? No, 8 < 20
      // And cursor (8) < currentScrollOffset (15)? Yes! So scroll to cursor position
      // Actually: 8 < 15 triggers the first condition, newOffset = max(0, 8) = 8
      // This keeps cursor visible at the top of visible area
      expect(newOffset).toBe(8);
    });
  });

  describe('real-world paste scenario', () => {
    const logContent = `[2026-01-14 01:06:08] [--------] [debug] [clients.go:58] loaded 0 API key clients
[2026-01-14 01:06:08] [--------] [debug] [clients.go:68] skipping auth directory rescan
[2026-01-14 01:06:08] [--------] [debug] [clients.go:98] triggering server update callback
[2026-01-14 01:06:08] [--------] [debug] [server.go:901] usage_statistics_enabled updated
[2026-01-14 01:06:08] [--------] [debug] [reconcile.go:159] auth providers unchanged
[2026-01-14 01:06:08] [--------] [debug] [server.go:984] triggering amp module config update
server clients and configuration updated: 1 clients (1 auth entries + 0 keys)
[2026-01-14 01:06:08] [--------] [info ] [clients.go:104] full client load complete
[2026-01-14 01:06:09] [--------] [debug] [updater.go:254] management asset up to date
[2026-01-14 01:06:10] [--------] [debug] [events.go:82] file system event detected`;

    it('should correctly calculate visual rows for log content', () => {
      const width = 80;
      const lines = logContent.split('\n');
      
      let totalVisualRows = 0;
      for (const line of lines) {
        totalVisualRows += Math.max(1, Math.ceil(line.length / width));
      }

      expect(lines.length).toBe(10);
      expect(totalVisualRows).toBeGreaterThanOrEqual(10);
    });

    it('should place cursor on valid visual row after paste', () => {
      const width = 80;
      const cursorOffset = logContent.length;

      const lines = logContent.split('\n');
      const info = getLineInfo(logContent, cursorOffset);

      // Calculate total visual rows
      let totalVisualRows = 0;
      for (const line of lines) {
        totalVisualRows += Math.max(1, Math.ceil(line.length / width));
      }

      // Calculate cursor visual row (same logic as component)
      let visualRow = 0;
      for (let i = 0; i < info.lineIndex; i++) {
        const lineLen = lines[i]?.length ?? 0;
        visualRow += Math.max(1, Math.ceil(lineLen / width));
      }

      const currentLineLen = lines[info.lineIndex]?.length ?? 0;
      const numRowsForCurrentLine = Math.max(1, Math.ceil(currentLineLen / width));
      const maxRowIndexInLine = numRowsForCurrentLine - 1;

      let wrappedRowInLine = currentLineLen > 0
        ? Math.floor(info.column / width)
        : 0;
      wrappedRowInLine = Math.min(wrappedRowInLine, maxRowIndexInLine);

      visualRow += wrappedRowInLine;

      // visualRow should be within bounds
      expect(visualRow).toBeLessThan(totalVisualRows);
      expect(visualRow).toBeGreaterThanOrEqual(0);
    });

    it('should allow navigation through all visual rows', () => {
      const width = 40; // Narrower to force wrapping
      const cursorOffset = logContent.length;

      // Navigate up through all rows
      let upCount = 0;
      let currentOffset: number | null = cursorOffset;
      
      while (currentOffset !== null) {
        const nextOffset = moveCursorVisually(logContent, currentOffset, 'up', width);
        if (nextOffset === null) break;
        currentOffset = nextOffset;
        upCount++;
        
        // Safety limit
        if (upCount > 100) break;
      }

      // Should be able to navigate up multiple times
      expect(upCount).toBeGreaterThan(0);

      // Now navigate back down
      let downCount = 0;
      while (currentOffset !== null) {
        const nextOffset = moveCursorVisually(logContent, currentOffset, 'down', width);
        if (nextOffset === null) break;
        currentOffset = nextOffset;
        downCount++;
        
        // Safety limit
        if (downCount > 100) break;
      }

      // Should be able to navigate back down approximately the same amount
      expect(downCount).toBeGreaterThan(0);
    });
  });

  describe('Microsoft-NVIDIA-Anthropic announcement at width 120', () => {
    const announcementText = `Today Microsoft, NVIDIA, and Anthropic announced new strategic partnerships. Anthropic is scaling its rapidly-growing Claude AI model on Microsoft Azure, powered by NVIDIA, which will broaden access to Claude and provide Azure enterprise customers with expanded model choice and new capabilities. Anthropic has committed to purchase $30 billion of Azure compute capacity and to contract additional compute capacity up to one gigawatt.

For the first time, NVIDIA and Anthropic are establishing a deep technology partnership to support Anthropic's future growth. Anthropic and NVIDIA will collaborate on design and engineering, with the goal of optimizing Anthropic models for the best possible performance, efficiency, and TCO, and optimizing future NVIDIA architectures for Anthropic workloads. Anthropic's compute commitment will initially be up to one gigawatt of compute capacity with NVIDIA Grace Blackwell and Vera Rubin systems.

Microsoft and Anthropic are also expanding their existing partnership to provide broader access to Claude for businesses. Customers of Microsoft Foundry will be able to access Anthropic's frontier Claude models including Claude Sonnet 4.5, Claude Opus 4.1, and Claude Haiku 4.5. This partnership will make Claude the only frontier model available on all three of the world's most prominent cloud services. Azure customers will gain expanded choice in models and access to Claude-specific capabilities.

Microsoft has also committed to continuing access for Claude across Microsoft's Copilot family, including GitHub Copilot, Microsoft 365 Copilot, and Copilot Studio.

As part of the partnership, NVIDIA and Microsoft are committing to invest up to $10 billion and up to $5 billion respectively in Anthropic.

Anthropic co-founder and CEO Dario Amodei, Microsoft Chairman and CEO Satya Nadella, and NVIDIA founder and CEO Jensen Huang gathered to discuss the new partnerships:`;

    const width = 120;

    function calculateVisualRowsDetailed(value: string, w: number) {
      const lines = value.split('\n');
      const rows: Array<{ text: string; logicalLine: number; rowInLine: number }> = [];

      for (let logicalIndex = 0; logicalIndex < lines.length; logicalIndex++) {
        const line = lines[logicalIndex] ?? '';
        if (line.length === 0) {
          rows.push({ text: '', logicalLine: logicalIndex, rowInLine: 0 });
        } else {
          let rowInLine = 0;
          for (let i = 0; i < line.length; i += w) {
            rows.push({
              text: line.slice(i, i + w),
              logicalLine: logicalIndex,
              rowInLine: rowInLine++,
            });
          }
        }
      }
      return rows;
    }

    function calculateCursorInfoDetailed(value: string, cursorOffset: number, w: number) {
      const lines = value.split('\n');
      const info = getLineInfo(value, cursorOffset);
      const logicalRow = info.lineIndex;
      const logicalCol = info.column;

      let visualRow = 0;
      for (let i = 0; i < logicalRow; i++) {
        const lineLen = lines[i]?.length ?? 0;
        visualRow += Math.max(1, Math.ceil(lineLen / w));
      }

      const currentLineLen = lines[logicalRow]?.length ?? 0;
      const numRowsForCurrentLine = Math.max(1, Math.ceil(currentLineLen / w));
      const maxRowIndexInLine = numRowsForCurrentLine - 1;

      let wrappedRowInLine = currentLineLen > 0
        ? Math.floor(logicalCol / w)
        : 0;
      wrappedRowInLine = Math.min(wrappedRowInLine, maxRowIndexInLine);

      visualRow += wrappedRowInLine;

      const rowStartCol = wrappedRowInLine * w;
      const visualCol = logicalCol - rowStartCol;

      return { logicalRow, logicalCol, visualRow, visualCol, wrappedRowInLine, currentLineLen };
    }

    it('should correctly count logical and visual lines', () => {
      const lines = announcementText.split('\n');
      const visualRows = calculateVisualRowsDetailed(announcementText, width);

      // Log actual structure for debugging
      console.log('Logical lines:', lines.length);
      console.log('Visual rows:', visualRows.length);
      lines.forEach((line, i) => {
        const vRows = Math.max(1, Math.ceil(line.length / width));
        console.log(`Line ${i}: ${line.length} chars -> ${vRows} visual rows`);
      });

      // The text has blank lines between paragraphs
      expect(lines.length).toBe(11); // Includes empty lines between paragraphs
      expect(visualRows.length).toBe(25);
    });

    it('should place cursor within valid visual row bounds at end of text', () => {
      const cursorOffset = announcementText.length;
      const cursorInfo = calculateCursorInfoDetailed(announcementText, cursorOffset, width);
      const visualRows = calculateVisualRowsDetailed(announcementText, width);

      // Cursor should be on last logical line
      expect(cursorInfo.logicalRow).toBe(10); // 0-indexed, 11 lines total

      // visualRow should be within bounds
      expect(cursorInfo.visualRow).toBeLessThan(visualRows.length);
      expect(cursorInfo.visualRow).toBe(visualRows.length - 1); // Should be on last row
    });

    it('should allow full navigation from end to start', () => {
      const visualRows = calculateVisualRowsDetailed(announcementText, width);
      let currentOffset: number | null = announcementText.length;
      const positions: number[] = [currentOffset];

      // Navigate up through all visual rows
      while (currentOffset !== null) {
        const nextOffset = moveCursorVisually(announcementText, currentOffset, 'up', width);
        if (nextOffset === null) break;
        currentOffset = nextOffset;
        positions.push(currentOffset);

        if (positions.length > 50) break; // Safety limit
      }

      // Should navigate through all visual rows
      expect(positions.length).toBe(visualRows.length);

      // First position should be at the end
      expect(positions[0]).toBe(announcementText.length);

      // Last position should be near the start (row 0)
      const lastPosition = positions[positions.length - 1];
      const lastCursorInfo = calculateCursorInfoDetailed(announcementText, lastPosition, width);
      expect(lastCursorInfo.visualRow).toBe(0);
    });

    it('should allow full navigation from start to end', () => {
      const visualRows = calculateVisualRowsDetailed(announcementText, width);
      let currentOffset: number | null = 0;
      const positions: number[] = [currentOffset];

      // Navigate down through all visual rows
      while (currentOffset !== null) {
        const nextOffset = moveCursorVisually(announcementText, currentOffset, 'down', width);
        if (nextOffset === null) break;
        currentOffset = nextOffset;
        positions.push(currentOffset);

        if (positions.length > 50) break; // Safety limit
      }

      // Should navigate through all visual rows
      expect(positions.length).toBe(visualRows.length);

      // Last position should be on the last visual row
      const lastPosition = positions[positions.length - 1];
      const lastCursorInfo = calculateCursorInfoDetailed(announcementText, lastPosition, width);
      expect(lastCursorInfo.visualRow).toBe(visualRows.length - 1);
    });

    it('should correctly position cursor within wrapped rows', () => {
      // Test cursor at position 150 (middle of second visual row of first paragraph)
      const cursorOffset = 150;
      const cursorInfo = calculateCursorInfoDetailed(announcementText, cursorOffset, width);

      expect(cursorInfo.logicalRow).toBe(0); // First paragraph
      expect(cursorInfo.wrappedRowInLine).toBe(1); // Second visual row (floor(150/120) = 1)
      expect(cursorInfo.visualCol).toBe(30); // 150 - 120 = 30
    });

    it('should handle navigation across paragraph boundaries', () => {
      // Find the start of second paragraph (after first blank line)
      const lines = announcementText.split('\n');
      let secondParaStart = 0;
      for (let i = 0; i < 2; i++) {
        secondParaStart += lines[i].length + 1;
      }

      const cursorInfo = calculateCursorInfoDetailed(announcementText, secondParaStart, width);
      
      // Moving up should go to previous row
      const upResult = moveCursorVisually(announcementText, secondParaStart, 'up', width);
      expect(upResult).not.toBeNull();

      const upCursorInfo = calculateCursorInfoDetailed(announcementText, upResult, width);
      expect(upCursorInfo.visualRow).toBe(cursorInfo.visualRow - 1);
    });

    it('should scroll correctly when cursor is at end', () => {
      const visualRows = calculateVisualRowsDetailed(announcementText, width);
      const cursorInfo = calculateCursorInfoDetailed(announcementText, announcementText.length, width);
      
      const visibleLines = 5; // maxLines
      
      // Calculate expected scroll
      const maxScroll = Math.max(0, visualRows.length - visibleLines);
      const expectedScroll = Math.min(maxScroll, cursorInfo.visualRow - visibleLines + 1);

      // Verify cursor would be visible after scroll
      expect(cursorInfo.visualRow).toBeGreaterThanOrEqual(expectedScroll);
      expect(cursorInfo.visualRow).toBeLessThan(expectedScroll + visibleLines);
    });

    it('should traverse every visual row exactly once going down then up', () => {
      const visualRows = calculateVisualRowsDetailed(announcementText, width);
      
      // Go down from start
      const downPositions: number[] = [0];
      let currentOffset: number | null = 0;
      while (currentOffset !== null) {
        const nextOffset = moveCursorVisually(announcementText, currentOffset, 'down', width);
        if (nextOffset === null) break;
        currentOffset = nextOffset;
        downPositions.push(currentOffset);
      }

      // Go back up
      const upPositions: number[] = [currentOffset];
      while (currentOffset !== null) {
        const nextOffset = moveCursorVisually(announcementText, currentOffset, 'up', width);
        if (nextOffset === null) break;
        currentOffset = nextOffset;
        upPositions.push(currentOffset);
      }

      // Both should have same length as visual rows
      expect(downPositions.length).toBe(visualRows.length);
      expect(upPositions.length).toBe(visualRows.length);

      // Verify we visited each visual row
      const downRows = downPositions.map(pos => 
        calculateCursorInfoDetailed(announcementText, pos, width).visualRow
      );
      const upRows = upPositions.map(pos => 
        calculateCursorInfoDetailed(announcementText, pos, width).visualRow
      );

      // Down should go 0, 1, 2, ... 24
      for (let i = 0; i < visualRows.length; i++) {
        expect(downRows[i]).toBe(i);
      }

      // Up should go 24, 23, 22, ... 0
      for (let i = 0; i < visualRows.length; i++) {
        expect(upRows[i]).toBe(visualRows.length - 1 - i);
      }
    });
  });
});
