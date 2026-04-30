export class ConversationContext {
  private activeConversationId: string = 'default';

  getActiveConversationId(): string {
    return this.activeConversationId;
  }

  setActiveConversationId(id: string): void {
    if (!id || id.trim().length === 0) {
      throw new Error('Conversation ID cannot be empty');
    }
    this.activeConversationId = id.trim();
  }

  createConversationId(topic?: string): string {
    const timestamp = Date.now();
    const slug = topic ? this.slugify(topic) : 'conversation';
    return `${slug}-${timestamp}`;
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 30);
  }
}
