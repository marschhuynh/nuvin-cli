import * as fsp from 'node:fs/promises';

export async function loadSessionHistoryUpdates(historyFile: string) {
  const raw = await fsp.readFile(historyFile, 'utf-8');
  const parsed = JSON.parse(raw) as { cli?: Array<{ role: string; content: unknown }> };
  const messages = parsed.cli ?? [];

  return messages.map((msg) => ({
    update: {
      sessionUpdate: msg.role === 'user' ? 'user_message_chunk' : 'agent_message_chunk',
      content: {
        type: 'text',
        text: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      },
    },
  }));
}
