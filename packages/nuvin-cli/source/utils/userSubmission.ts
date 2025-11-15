import { promises as fs } from 'node:fs';
import os from 'node:os';
import * as path from 'node:path';
import type { UserAttachment, UserMessagePayload } from '@nuvin/nuvin-core';

type Segment = { kind: 'text'; value: string } | { kind: 'attachment'; index: number };

type PendingAttachment =
  | { kind: 'inline'; token: string; label: string; dataUri: string }
  | { kind: 'file'; token: string; label: string; path: string };

const DATA_URI_REGEX = /data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+/g;
const FILE_REF_REGEX = /@(?:"([^"]+)"|'([^']+)'|([^\s]+))/g;

const IMAGE_MIME_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.jfif': 'image/jpeg',
};

const createToken = (index: number): string => `<<nuvin-attachment-${index}>>`;

const sanitizeBase64 = (value: string): string => value.replace(/\s+/g, '');

const expandHomeDir = (input: string): string => {
  if (!input.startsWith('~')) return input;
  return path.join(os.homedir(), input.slice(1));
};

const resolveFilePath = (input: string): string => path.resolve(expandHomeDir(input));

const ensureMimeType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  const mime = IMAGE_MIME_TYPES[ext];
  if (!mime) {
    throw new Error(`Unsupported image type for ${filePath}`);
  }
  return mime;
};

export async function prepareUserSubmission(raw: string, clipboardFiles?: Buffer[]): Promise<UserMessagePayload> {
  const attachments: PendingAttachment[] = [];
  const segments: Segment[] = [];

  // Handle clipboard files first
  if (clipboardFiles && clipboardFiles.length > 0) {
    clipboardFiles.forEach((buffer) => {
      const tokenIndex = attachments.length + 1;
      const token = createToken(tokenIndex);
      const label = `clipboard-file-${tokenIndex}`;
      const dataUri = `data:image/png;base64,${buffer.toString('base64')}`;
      attachments.push({ kind: 'inline', token, label, dataUri });
    });
  }

  let cursor = 0;
  DATA_URI_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: regex iteration pattern
  while ((match = DATA_URI_REGEX.exec(raw)) !== null) {
    const start = match.index;
    if (start > cursor) {
      segments.push({ kind: 'text', value: raw.slice(cursor, start) });
    }
    const tokenIndex = attachments.length + 1;
    const token = createToken(tokenIndex);
    const label = `clipboard-image-${tokenIndex}`;
    attachments.push({ kind: 'inline', token, label, dataUri: match[0] });
    segments.push({ kind: 'attachment', index: attachments.length - 1 });
    cursor = start + match[0].length;
  }
  if (cursor < raw.length) {
    segments.push({ kind: 'text', value: raw.slice(cursor) });
  }

  const expandedSegments: Segment[] = [];
  for (const segment of segments) {
    if (segment.kind === 'attachment') {
      expandedSegments.push(segment);
      continue;
    }

    const text = segment.value;
    let last = 0;
    FILE_REF_REGEX.lastIndex = 0;
    let fileMatch: RegExpExecArray | null;
    // biome-ignore lint/suspicious/noAssignInExpressions: regex iteration pattern
    while ((fileMatch = FILE_REF_REGEX.exec(text)) !== null) {
      const start = fileMatch.index;
      const prevChar = start > 0 ? text[start - 1] : undefined;
      if (prevChar && !/[\s([{<'"`]/.test(prevChar)) {
        continue;
      }
      const candidateRaw = (fileMatch[1] ?? fileMatch[2] ?? fileMatch[3] ?? '').trim();
      if (!candidateRaw) continue;
      const ext = path.extname(candidateRaw).toLowerCase();
      if (!IMAGE_MIME_TYPES[ext]) {
        continue;
      }
      if (start > last) {
        expandedSegments.push({ kind: 'text', value: text.slice(last, start) });
      }
      const tokenIndex = attachments.length + 1;
      const token = createToken(tokenIndex);
      const label = path.basename(candidateRaw) || `image-${tokenIndex}`;
      attachments.push({ kind: 'file', token, label, path: candidateRaw });
      expandedSegments.push({ kind: 'attachment', index: attachments.length - 1 });
      last = FILE_REF_REGEX.lastIndex;
    }
    if (last < text.length) {
      expandedSegments.push({ kind: 'text', value: text.slice(last) });
    }
  }

  const finalSegments = expandedSegments.length > 0 ? expandedSegments : segments;
  const textWithTokens = finalSegments
    .map((segment) => (segment.kind === 'text' ? segment.value : attachments[segment.index].token))
    .join('');
  const displayText = finalSegments
    .map((segment) => {
      if (segment.kind === 'text') return segment.value;
      const attachment = attachments[segment.index];
      return `[image:${attachment.label}]`;
    })
    .join('');

  if (attachments.length === 0) {
    const textOutput = textWithTokens || raw;
    const displayOutput = displayText || raw;
    return { text: textOutput, displayText: displayOutput };
  }

  const preparedAttachments: UserAttachment[] = [];
  for (const attachment of attachments) {
    if (attachment.kind === 'inline') {
      const inlineMatch = attachment.dataUri.match(/^data:([^;]+);base64,(.+)$/s);
      if (!inlineMatch) {
        throw new Error('Clipboard data did not contain a valid base64 image.');
      }
      const mimeType = inlineMatch[1];
      const base64 = sanitizeBase64(inlineMatch[2]);
      preparedAttachments.push({
        type: 'image',
        token: attachment.token,
        mimeType,
        data: base64,
        altText: attachment.label,
        source: 'inline',
        name: attachment.label,
      });
      continue;
    }

    const resolvedPath = resolveFilePath(attachment.path);
    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(resolvedPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Unable to read image at ${attachment.path}: ${message}`);
    }
    const mimeType = ensureMimeType(resolvedPath);
    preparedAttachments.push({
      type: 'image',
      token: attachment.token,
      mimeType,
      data: fileBuffer.toString('base64'),
      altText: attachment.label,
      source: 'file',
      name: path.basename(resolvedPath),
    });
  }

  const textOutput = textWithTokens || raw;
  const displayOutput = displayText || raw;

  return {
    text: textOutput,
    displayText: displayOutput,
    attachments: preparedAttachments,
  };
}
