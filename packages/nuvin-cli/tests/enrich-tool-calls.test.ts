import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ToolCall } from '@nuvin/nuvin-core';

import { enrichToolCallsWithLineNumbers, type EnrichedToolCall } from '../source/utils/enrichToolCalls.js';

const TEST_DIR = join(process.cwd(), 'test-tmp');
const TEST_FILE = join(TEST_DIR, 'test-file.txt');

describe('enrichToolCalls', () => {
  beforeEach(async () => {
    await mkdir(TEST_DIR, { recursive: true });
  });

  afterEach(async () => {
    await rm(TEST_DIR, { recursive: true, force: true });
  });

  it('should calculate correct line numbers for replacement in middle of file', async () => {
    const fileContent = `line1
line2
line3
OLD_TEXT_LINE4
OLD_TEXT_LINE5
line6
line7`;

    await writeFile(TEST_FILE, fileContent, 'utf-8');

    const toolCall: ToolCall = {
      id: 'test-1',
      type: 'function',
      function: {
        name: 'file_edit',
        arguments: JSON.stringify({
          file_path: TEST_FILE,
          old_text: 'OLD_TEXT_LINE4\nOLD_TEXT_LINE5',
          new_text: 'NEW_TEXT_LINE4\nNEW_TEXT_LINE5',
        }),
      },
    };

    const [enriched] = await enrichToolCallsWithLineNumbers([toolCall]);
    const metadata = (enriched as EnrichedToolCall).metadata;

    expect(metadata).toBeDefined();
    expect(metadata.lineNumbers).toEqual({
      oldStartLine: 4,
      oldEndLine: 5,
      newStartLine: 4,
      newEndLine: 5,
      oldLineCount: 2,
      newLineCount: 2,
    });
  });

  it('should calculate correct line numbers with trailing newline', async () => {
    const fileContent = `line1
line2
OLD_TEXT
line4
`;

    await writeFile(TEST_FILE, fileContent, 'utf-8');

    const toolCall: ToolCall = {
      id: 'test-2',
      type: 'function',
      function: {
        name: 'file_edit',
        arguments: JSON.stringify({
          file_path: TEST_FILE,
          old_text: 'OLD_TEXT\n',
          new_text: 'NEW_TEXT\n',
        }),
      },
    };

    const [enriched] = await enrichToolCallsWithLineNumbers([toolCall]);
    const metadata = (enriched as EnrichedToolCall).metadata;

    expect(metadata).toBeDefined();
    expect(metadata.lineNumbers).toEqual({
      oldStartLine: 3,
      oldEndLine: 3,
      newStartLine: 3,
      newEndLine: 3,
      oldLineCount: 1,
      newLineCount: 1,
    });
  });

  it('should calculate correct line numbers for multi-line replacement', async () => {
    const fileContent = `# Header

## Section 1

Content line 1
Content line 2
Content line 3

## Section 2

More content`;

    await writeFile(TEST_FILE, fileContent, 'utf-8');

    const toolCall: ToolCall = {
      id: 'test-3',
      type: 'function',
      function: {
        name: 'file_edit',
        arguments: JSON.stringify({
          file_path: TEST_FILE,
          old_text: 'Content line 1\nContent line 2\nContent line 3',
          new_text: 'Updated content',
        }),
      },
    };

    const [enriched] = await enrichToolCallsWithLineNumbers([toolCall]);
    const metadata = (enriched as EnrichedToolCall).metadata;

    expect(metadata).toBeDefined();
    expect(metadata.lineNumbers).toEqual({
      oldStartLine: 5,
      oldEndLine: 7,
      newStartLine: 5,
      newEndLine: 5,
      oldLineCount: 3,
      newLineCount: 1,
    });
  });

  it('should handle empty new_text (deletion)', async () => {
    const fileContent = `line1
DELETE_ME
line3`;

    await writeFile(TEST_FILE, fileContent, 'utf-8');

    const toolCall: ToolCall = {
      id: 'test-4',
      type: 'function',
      function: {
        name: 'file_edit',
        arguments: JSON.stringify({
          file_path: TEST_FILE,
          old_text: 'DELETE_ME\n',
          new_text: '',
        }),
      },
    };

    const [enriched] = await enrichToolCallsWithLineNumbers([toolCall]);
    const metadata = (enriched as EnrichedToolCall).metadata;

    expect(metadata).toBeDefined();
    expect(metadata.lineNumbers).toEqual({
      oldStartLine: 2,
      oldEndLine: 2,
      newStartLine: 2,
      newEndLine: 1,
      oldLineCount: 1,
      newLineCount: 0,
    });
  });

  it('should handle replacement at beginning of file', async () => {
    const fileContent = `FIRST_LINE
second line
third line`;

    await writeFile(TEST_FILE, fileContent, 'utf-8');

    const toolCall: ToolCall = {
      id: 'test-5',
      type: 'function',
      function: {
        name: 'file_edit',
        arguments: JSON.stringify({
          file_path: TEST_FILE,
          old_text: 'FIRST_LINE',
          new_text: 'UPDATED_FIRST_LINE',
        }),
      },
    };

    const [enriched] = await enrichToolCallsWithLineNumbers([toolCall]);
    const metadata = (enriched as EnrichedToolCall).metadata;

    expect(metadata).toBeDefined();
    expect(metadata.lineNumbers).toEqual({
      oldStartLine: 1,
      oldEndLine: 1,
      newStartLine: 1,
      newEndLine: 1,
      oldLineCount: 1,
      newLineCount: 1,
    });
  });

  it('should handle replacement at end of file', async () => {
    const fileContent = `line1
line2
LAST_LINE`;

    await writeFile(TEST_FILE, fileContent, 'utf-8');

    const toolCall: ToolCall = {
      id: 'test-6',
      type: 'function',
      function: {
        name: 'file_edit',
        arguments: JSON.stringify({
          file_path: TEST_FILE,
          old_text: 'LAST_LINE',
          new_text: 'UPDATED_LAST_LINE',
        }),
      },
    };

    const [enriched] = await enrichToolCallsWithLineNumbers([toolCall]);
    const metadata = (enriched as EnrichedToolCall).metadata;

    expect(metadata).toBeDefined();
    expect(metadata.lineNumbers).toEqual({
      oldStartLine: 3,
      oldEndLine: 3,
      newStartLine: 3,
      newEndLine: 3,
      oldLineCount: 1,
      newLineCount: 1,
    });
  });

  it('should not enrich if old_text not found in file', async () => {
    const fileContent = `line1
line2`;

    await writeFile(TEST_FILE, fileContent, 'utf-8');

    const toolCall: ToolCall = {
      id: 'test-7',
      type: 'function',
      function: {
        name: 'file_edit',
        arguments: JSON.stringify({
          file_path: TEST_FILE,
          old_text: 'NON_EXISTENT',
          new_text: 'NEW',
        }),
      },
    };

    const [enriched] = await enrichToolCallsWithLineNumbers([toolCall]);
    const metadata = (enriched as EnrichedToolCall).metadata;

    expect(metadata).toBeUndefined();
  });

  it('should not enrich if file does not exist', async () => {
    const toolCall: ToolCall = {
      id: 'test-8',
      type: 'function',
      function: {
        name: 'file_edit',
        arguments: JSON.stringify({
          file_path: join(TEST_DIR, 'non-existent.txt'),
          old_text: 'OLD',
          new_text: 'NEW',
        }),
      },
    };

    const [enriched] = await enrichToolCallsWithLineNumbers([toolCall]);
    const metadata = (enriched as EnrichedToolCall).metadata;

    expect(metadata).toBeUndefined();
  });

  it('should not enrich non-file_edit tool calls', async () => {
    const toolCall: ToolCall = {
      id: 'test-9',
      type: 'function',
      function: {
        name: 'bash_tool',
        arguments: JSON.stringify({
          action: 'exec',
          cmd: 'echo hello',
        }),
      },
    };

    const [enriched] = await enrichToolCallsWithLineNumbers([toolCall]);
    const metadata = (enriched as EnrichedToolCall).metadata;

    expect(metadata).toBeUndefined();
  });

  it('should handle CRLF line endings', async () => {
    const fileContent = `line1\r\nOLD_TEXT\r\nline3`;

    await writeFile(TEST_FILE, fileContent, 'utf-8');

    const toolCall: ToolCall = {
      id: 'test-10',
      type: 'function',
      function: {
        name: 'file_edit',
        arguments: JSON.stringify({
          file_path: TEST_FILE,
          old_text: 'OLD_TEXT',
          new_text: 'NEW_TEXT',
        }),
      },
    };

    const [enriched] = await enrichToolCallsWithLineNumbers([toolCall]);
    const metadata = (enriched as EnrichedToolCall).metadata;

    expect(metadata).toBeDefined();
    expect(metadata.lineNumbers).toEqual({
      oldStartLine: 2,
      oldEndLine: 2,
      newStartLine: 2,
      newEndLine: 2,
      oldLineCount: 1,
      newLineCount: 1,
    });
  });
});
