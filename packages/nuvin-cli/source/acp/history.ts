import * as fsp from 'node:fs/promises';

type StoredMessage = {
  role?: string;
  content?: unknown;
};

function toDisplayText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (content && typeof content === 'object') {
    const maybeParts = (content as { parts?: unknown }).parts;
    if (Array.isArray(maybeParts)) {
      const text = maybeParts
        .map((part) => {
          if (part && typeof part === 'object' && (part as { type?: string }).type === 'text') {
            return String((part as { text?: unknown }).text ?? '');
          }
          return '';
        })
        .filter(Boolean)
        .join('\n');
      if (text) {
        return text;
      }
    }
  }

  return JSON.stringify(content);
}

export async function loadSessionHistoryUpdates(historyFile: string) {
  const raw = await fsp.readFile(historyFile, 'utf-8');
  const parsed = JSON.parse(raw) as { default?: StoredMessage[]; cli?: StoredMessage[] };
  const messages = parsed.default ?? parsed.cli ?? [];

  return messages.map((msg) => ({
    update: {
      sessionUpdate: msg.role === 'user' ? 'user_message_chunk' : 'agent_message_chunk',
      content: {
        type: 'text',
        text: toDisplayText(msg.content),
      },
    },
  }));
}
