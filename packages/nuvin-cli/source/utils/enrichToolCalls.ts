import type { ToolCall } from '@nuvin/nuvin-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { skillsService } from '@/services/SkillsService.js';

export type LineNumbers = {
  oldStartLine: number;
  oldEndLine: number;
  newStartLine: number;
  newEndLine: number;
  oldLineCount: number;
  newLineCount: number;
};

export type SkillMetadata = {
  name: string;
  description: string;
  content: string;
  location: string;
};

export type EnrichedToolCall = ToolCall & {
  metadata?: {
    lineNumbers?: LineNumbers;
    skill?: SkillMetadata;
    [key: string]: unknown;
  };
};

function normalizeToLF(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

function calculateLineNumbers(originalText: string, oldText: string, matchIndex: number, newText: string): LineNumbers {
  const textBeforeMatch = originalText.slice(0, matchIndex);
  const oldStartLine = textBeforeMatch.split('\n').length;

  const oldTextTrimmed = oldText.replace(/\n$/, '');
  const oldLineCount = oldTextTrimmed.length === 0 ? 0 : oldTextTrimmed.split('\n').length;
  const oldEndLine = oldStartLine + oldLineCount - 1;

  const newTextTrimmed = newText.replace(/\n$/, '');
  const newLineCount = newTextTrimmed.length === 0 ? 0 : newTextTrimmed.split('\n').length;
  const newStartLine = oldStartLine;
  const newEndLine = newStartLine + newLineCount - 1;

  return {
    oldStartLine,
    oldEndLine,
    newStartLine,
    newEndLine,
    oldLineCount,
    newLineCount,
  };
}

async function enrichFileEditToolCall(toolCall: ToolCall): Promise<EnrichedToolCall> {
  try {
    const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
    if (!args.file_path || args.old_text === undefined || args.new_text === undefined) {
      return toolCall;
    }

    const filePath = resolve(args.file_path);
    const content = await readFile(filePath, 'utf-8');
    const contentLF = normalizeToLF(content);
    const oldTextLF = normalizeToLF(args.old_text);
    const newTextLF = normalizeToLF(args.new_text);

    const matchIndex = contentLF.indexOf(oldTextLF);
    if (matchIndex === -1) {
      return toolCall;
    }

    const lineNumbers = calculateLineNumbers(contentLF, oldTextLF, matchIndex, newTextLF);

    return {
      ...toolCall,
      metadata: {
        lineNumbers,
      },
    };
  } catch {
    return toolCall;
  }
}

async function enrichSkillToolCall(toolCall: ToolCall): Promise<EnrichedToolCall> {
  try {
    const args = toolCall.function.arguments ? JSON.parse(toolCall.function.arguments) : {};
    if (!args.name) {
      return toolCall;
    }

    await skillsService.discover(process.cwd());
    const skill = await skillsService.loadFull(args.name);

    if (!skill) {
      return toolCall;
    }

    return {
      ...toolCall,
      metadata: {
        skill: {
          name: skill.name,
          description: skill.description,
          content: skill.content,
          location: skill.location,
        },
      },
    };
  } catch {
    return toolCall;
  }
}

export async function enrichToolCallsWithLineNumbers(toolCalls: ToolCall[]): Promise<EnrichedToolCall[]> {
  return Promise.all(
    toolCalls.map((call) => {
      if (call.function.name === 'file_edit') {
        return enrichFileEditToolCall(call);
      }
      if (call.function.name === 'skill') {
        return enrichSkillToolCall(call);
      }
      return call;
    }),
  );
}
