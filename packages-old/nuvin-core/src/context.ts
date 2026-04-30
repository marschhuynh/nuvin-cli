import type { ChatMessage, ContextBuilder, Message, MessageContent, ProviderContentPart } from './ports.js';

// Simple context builder: system + transformed history + new user messages
const toProviderContent = (content: MessageContent): string | ProviderContentPart[] => {
  if (content === null || content === undefined) {
    return '';
  }

  if (typeof content === 'string') {
    return content;
  }

  if (content.type === 'parts') {
    const providerParts: ProviderContentPart[] = [];
    for (const part of content.parts) {
      if (part.type === 'text') {
        if (part.text.length > 0) {
          providerParts.push({ type: 'text', text: part.text });
        }
        continue;
      }

      const label = part.altText ?? (part.name ? `Image attachment: ${part.name}` : undefined);
      if (label) {
        providerParts.push({ type: 'text', text: label });
      }

      const url = `data:${part.mimeType};base64,${part.data}`;
      providerParts.push({ type: 'image_url', image_url: { url } });
    }

    return providerParts.length > 0 ? providerParts : [];
  }

  return [];
};

export class SimpleContextBuilder implements ContextBuilder {
  toProviderMessages(history: Message[], systemPrompt: string, newUserContent: MessageContent[]): ChatMessage[] {
    const transformed: ChatMessage[] = [];

    for (const m of history) {
      const providerContent = toProviderContent(m.content);
      if (m.role === 'user') {
        transformed.push({ role: 'user', content: providerContent ?? '' });
      } else if (m.role === 'assistant') {
        if (m.tool_calls && m.tool_calls.length > 0) {
          transformed.push({
            ...m,
            role: 'assistant',
            content: providerContent ?? null,
            tool_calls: m.tool_calls,
          });
        } else {
          transformed.push({
            ...m,
            role: 'assistant',
            content: providerContent ?? '',
          });
        }
      } else if (m.role === 'tool') {
        if (m.tool_call_id) {
          transformed.push({
            role: 'tool',
            content: typeof providerContent === 'string' ? providerContent : (providerContent ?? ''),
            tool_call_id: m.tool_call_id,
            name: m.name,
          });
        }
      }
    }

    const userMsgs: ChatMessage[] = newUserContent.map((c) => ({
      role: 'user',
      content: toProviderContent(c) ?? '',
    }));

    return [{ role: 'system', content: systemPrompt }, ...transformed, ...userMsgs];
  }
}

// Context builder that augments the provided system prompt with basic system information
// (current ISO time and current working directory) before delegating to another builder.
export class SystemInfoContextBuilder implements ContextBuilder {
  constructor(private readonly inner: ContextBuilder = new SimpleContextBuilder()) {}

  toProviderMessages(history: Message[], systemPrompt: string, newUserContent: MessageContent[]): ChatMessage[] {
    const nowIso = new Date().toISOString();
    let cwd: string | undefined;
    try {
      const proc = typeof process !== 'undefined' ? process : undefined;
      cwd = proc && typeof proc.cwd === 'function' ? proc.cwd() : undefined;
    } catch {
      cwd = undefined;
    }

    const augmented = [
      systemPrompt?.trim?.() ?? '',
      '\nSystem info:',
      `- Time: ${nowIso}`,
      `- CWD: ${cwd ?? 'N/A'}`,
    ].join('\n');

    return this.inner.toProviderMessages(history, augmented, newUserContent);
  }
}
