import type { RemindersPort } from './ports.js';

export class NoopReminders implements RemindersPort {
  enhance(content: string, _opts: { conversationId?: string }): string[] {
    return [content];
  }
}
