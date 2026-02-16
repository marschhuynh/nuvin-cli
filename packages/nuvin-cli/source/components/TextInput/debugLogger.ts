import * as os from 'node:os';
import * as path from 'node:path';
import { FileLogger } from '@/utils/file-logger.js';

function isEnabled(flag: string | undefined): boolean {
  if (!flag) return false;
  const normalized = flag.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

export const isTextInputDebugEnabled = isEnabled(process.env.NUVIN_TEXTINPUT_DEBUG);
export const isTextInputDebugVerbose = isEnabled(process.env.NUVIN_TEXTINPUT_DEBUG_VERBOSE);

const textInputLogger = isTextInputDebugEnabled
  ? new FileLogger({
      logDir: path.join(os.homedir(), '.nuvin', 'logs'),
      logFileName: process.env.NUVIN_TEXTINPUT_DEBUG_FILE || 'textinput-debug',
      minLevel: 'debug',
      maxFileSize: 20 * 1024 * 1024,
      maxFiles: 5,
      includeTimestamp: true,
      logToConsole: false,
    })
  : null;

let hasLoggedSessionHeader = false;
let eventSequence = 0;

export function logTextInputDebug(message: string, data?: unknown): void {
  if (!textInputLogger) {
    return;
  }

  if (!hasLoggedSessionHeader) {
    hasLoggedSessionHeader = true;
    textInputLogger.debug('TextInput debug session started', {
      pid: process.pid,
      term: process.env.TERM,
      termProgram: process.env.TERM_PROGRAM,
      logFile: textInputLogger.getLogFilePath(),
      verbose: isTextInputDebugVerbose,
    });
  }

  eventSequence += 1;
  const payload =
    data && typeof data === 'object'
      ? {
          seq: eventSequence,
          ...data,
        }
      : {
          seq: eventSequence,
          data,
        };

  textInputLogger.debug(message, payload);
}

export function getTextInputDebugLogPath(): string | null {
  return textInputLogger?.getLogFilePath() ?? null;
}

// --- Debug format helpers (moved from TextInput.tsx) ---

export function formatInputForDebug(input: string): string {
  return input
    .replace(/\x1b/g, '<ESC>')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

export function summarizeLinesForDebug(lines: string[]): Array<{ index: number; length: number; preview: string }> {
  return lines.slice(0, 8).map((line, index) => ({
    index,
    length: line.length,
    preview: formatInputForDebug(line.slice(0, 120)),
  }));
}

type VisualRowLike = { text: string; logicalLine: number; startCol: number; endCol: number; isFullLine: boolean };

export function summarizeVisualRowsForDebug(
  rows: VisualRowLike[],
): Array<{ index: number; logicalLine: number; startCol: number; endCol: number; length: number; preview: string }> {
  return rows.slice(0, 20).map((row, index) => ({
    index,
    logicalLine: row.logicalLine,
    startCol: row.startCol,
    endCol: row.endCol,
    length: row.text.length,
    preview: formatInputForDebug(row.text.slice(0, 80)),
  }));
}

// --- Debug render-summary hook ---

import { useEffect, useRef } from 'react';
import type { LineIndex } from './useLineIndex.js';
import type { CursorInfo, VisualRow } from './useVisualRows.js';

export type UseTextInputDebugLoggerOptions = {
  editorValue: string;
  editorCursorOffset: number;
  cols: number;
  containerWidth: number | undefined;
  scrollBoxWidth: number | undefined;
  effectiveWidth: number;
  maxLines: number | undefined;
  lines: string[];
  visualRows: VisualRow[];
  visualLineCount: number;
  hasScrolling: boolean;
  visibleLines: number;
  scrollOffset: number;
  cursorInfo: CursorInfo;
  lineIndex: LineIndex;
};

export function useTextInputDebugLogger({
  editorValue,
  editorCursorOffset,
  cols,
  containerWidth,
  scrollBoxWidth,
  effectiveWidth,
  maxLines,
  lines,
  visualRows,
  visualLineCount,
  hasScrolling,
  visibleLines,
  scrollOffset,
  cursorInfo,
  lineIndex,
}: UseTextInputDebugLoggerOptions): void {
  const lastRenderFingerprintRef = useRef<string>('');

  useEffect(() => {
    if (!isTextInputDebugEnabled) {
      return;
    }

    const lineInfo = lineIndex.getLineInfo(editorCursorOffset);

    const fingerprint = [
      editorValue.length,
      editorCursorOffset,
      cols,
      containerWidth,
      scrollBoxWidth,
      effectiveWidth,
      effectiveWidth,
      maxLines,
      visualLineCount,
      hasScrolling,
      visibleLines,
      scrollOffset,
      cursorInfo.visualRow,
      cursorInfo.visualCol,
      lineInfo.lineIndex,
      lineInfo.column,
    ].join('|');

    if (!isTextInputDebugVerbose && lastRenderFingerprintRef.current === fingerprint) {
      return;
    }

    lastRenderFingerprintRef.current = fingerprint;

    const summary: Record<string, unknown> = {
      valueLength: editorValue.length,
      cursorOffset: editorCursorOffset,
      cursorLogicalLine: lineInfo.lineIndex,
      cursorLogicalCol: lineInfo.column,
      cursorLineStart: lineInfo.lineStart,
      cursorLineEnd: lineInfo.lineEnd,
      cursorVisualRow: cursorInfo.visualRow,
      cursorVisualCol: cursorInfo.visualCol,
      cols,
      measuredOuterWidth: containerWidth,
      measuredInnerWidth: scrollBoxWidth,
      effectiveWidth,
      maxLines,
      lineCount: lines.length,
      lineLengths: lines.slice(0, 20).map((line) => line.length),
      visualLineCount,
      hasScrolling,
      visibleLines,
      scrollOffset,
    };

    if (isTextInputDebugVerbose) {
      summary.linesHead = summarizeLinesForDebug(lines);
      summary.visualRowsHead = summarizeVisualRowsForDebug(visualRows);
    }

    logTextInputDebug('render summary', summary);

    if (effectiveWidth <= 4 || (scrollBoxWidth !== undefined && scrollBoxWidth <= 4)) {
      logTextInputDebug('anomaly: suspicious tiny layout width in render', {
        effectiveWidth,
        measuredOuterWidth: containerWidth,
        measuredInnerWidth: scrollBoxWidth,
        cols,
        cursorOffset: editorCursorOffset,
        valueLength: editorValue.length,
      });
    }
  }, [
    editorValue.length,
    editorCursorOffset,
    cols,
    containerWidth,
    scrollBoxWidth,
    effectiveWidth,
    maxLines,
    lines,
    visualRows,
    visualLineCount,
    hasScrolling,
    visibleLines,
    scrollOffset,
    cursorInfo.visualRow,
    cursorInfo.visualCol,
    lineIndex,
  ]);
}
