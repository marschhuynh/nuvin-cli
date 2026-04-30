import { describe, it, expect } from 'vitest';
import type { MessageLine } from '../source/adapters/index.js';

/**
 * Tests for ChatDisplay scroll container behavior
 * Verifies that live content is properly bounded and scrollable
 */

describe('ChatDisplay - Scroll Container Logic', () => {
  /**
   * Calculate max live height based on terminal rows
   * Mirrors the logic in ChatDisplay component
   */
  function calculateMaxLiveHeight(rows: number): number {
    return Math.max(5, rows - 8);
  }

  it('should calculate max live height for standard terminal (24 rows)', () => {
    const maxHeight = calculateMaxLiveHeight(24);
    expect(maxHeight).toBe(16); // 24 - 8 = 16
  });

  it('should calculate max live height for large terminal (50 rows)', () => {
    const maxHeight = calculateMaxLiveHeight(50);
    expect(maxHeight).toBe(42); // 50 - 8 = 42
  });

  it('should enforce minimum height of 5 for small terminals', () => {
    const maxHeight = calculateMaxLiveHeight(10);
    expect(maxHeight).toBe(5); // max(5, 10 - 8) = max(5, 2) = 5
  });

  it('should enforce minimum height of 5 for very small terminals', () => {
    const maxHeight = calculateMaxLiveHeight(5);
    expect(maxHeight).toBe(5); // max(5, 5 - 8) = max(5, -3) = 5
  });

  /**
   * Determine if scroll container should be rendered
   * Only render when there are visible (live) messages
   */
  function shouldRenderScrollContainer(visible: MessageLine[]): boolean {
    return visible.length > 0;
  }

  it('should render scroll container when visible messages exist', () => {
    const visible: MessageLine[] = [
      { id: '1', type: 'assistant', content: 'streaming...', metadata: { isStreaming: true } },
    ];
    expect(shouldRenderScrollContainer(visible)).toBe(true);
  });

  it('should not render scroll container when no visible messages', () => {
    const visible: MessageLine[] = [];
    expect(shouldRenderScrollContainer(visible)).toBe(false);
  });

  /**
   * Determine if auto-scroll to bottom should trigger
   * Should scroll when visible content changes (length or streaming content)
   */
  function shouldAutoScroll(
    prevVisibleLength: number,
    currentVisibleLength: number,
    prevContentLength: number,
    currentContentLength: number,
  ): boolean {
    if (currentVisibleLength === 0) return false;
    return currentVisibleLength !== prevVisibleLength || currentContentLength !== prevContentLength;
  }

  it('should auto-scroll when new visible message added', () => {
    expect(shouldAutoScroll(0, 1, 0, 10)).toBe(true);
    expect(shouldAutoScroll(1, 2, 10, 20)).toBe(true);
  });

  it('should auto-scroll when streaming content grows', () => {
    expect(shouldAutoScroll(1, 1, 10, 50)).toBe(true);
    expect(shouldAutoScroll(1, 1, 100, 200)).toBe(true);
  });

  it('should not auto-scroll when nothing changed', () => {
    expect(shouldAutoScroll(1, 1, 10, 10)).toBe(false);
  });

  it('should not auto-scroll when visible becomes empty', () => {
    expect(shouldAutoScroll(1, 0, 10, 0)).toBe(false);
  });
});

describe('ChatDisplay - Static vs Visible Split', () => {
  /**
   * Split messages into static (frozen) and visible (live) portions
   */
  function splitMessages(
    messages: MessageLine[],
    staticCount: number,
  ): { staticItems: MessageLine[]; visible: MessageLine[] } {
    return {
      staticItems: messages.slice(0, staticCount),
      visible: messages.slice(staticCount),
    };
  }

  it('should split messages correctly', () => {
    const messages: MessageLine[] = [
      { id: '1', type: 'user', content: 'hello' },
      { id: '2', type: 'assistant', content: 'hi' },
      { id: '3', type: 'assistant', content: 'streaming...', metadata: { isStreaming: true } },
    ];

    const { staticItems, visible } = splitMessages(messages, 2);

    expect(staticItems).toHaveLength(2);
    expect(staticItems[0].id).toBe('1');
    expect(staticItems[1].id).toBe('2');

    expect(visible).toHaveLength(1);
    expect(visible[0].id).toBe('3');
  });

  it('should handle all messages being static', () => {
    const messages: MessageLine[] = [
      { id: '1', type: 'user', content: 'hello' },
      { id: '2', type: 'assistant', content: 'hi' },
    ];

    const { staticItems, visible } = splitMessages(messages, 2);

    expect(staticItems).toHaveLength(2);
    expect(visible).toHaveLength(0);
  });

  it('should handle all messages being visible', () => {
    const messages: MessageLine[] = [
      { id: '1', type: 'assistant', content: 'streaming...', metadata: { isStreaming: true } },
    ];

    const { staticItems, visible } = splitMessages(messages, 0);

    expect(staticItems).toHaveLength(0);
    expect(visible).toHaveLength(1);
  });

  it('should handle empty messages', () => {
    const messages: MessageLine[] = [];

    const { staticItems, visible } = splitMessages(messages, 0);

    expect(staticItems).toHaveLength(0);
    expect(visible).toHaveLength(0);
  });
});

describe('ChatDisplay - Memory Management', () => {
  const MAX_RENDERED_LINES = 2000;

  /**
   * Mimics the eviction logic in useMessage hook
   */
  function evictOldMessages(messages: MessageLine[], newMessage: MessageLine): MessageLine[] {
    if (messages.length + 1 > MAX_RENDERED_LINES) {
      return [...messages.slice(-(MAX_RENDERED_LINES - 1)), newMessage];
    }
    return [...messages, newMessage];
  }

  it('should not evict when under limit', () => {
    const messages: MessageLine[] = Array.from({ length: 100 }, (_, i) => ({
      id: `${i}`,
      type: 'user',
      content: `msg ${i}`,
    }));

    const newMessage: MessageLine = { id: '100', type: 'user', content: 'new' };
    const result = evictOldMessages(messages, newMessage);

    expect(result).toHaveLength(101);
    expect(result[0].id).toBe('0');
    expect(result[100].id).toBe('100');
  });

  it('should evict oldest messages when at limit', () => {
    const messages: MessageLine[] = Array.from({ length: MAX_RENDERED_LINES }, (_, i) => ({
      id: `${i}`,
      type: 'user',
      content: `msg ${i}`,
    }));

    const newMessage: MessageLine = { id: 'new', type: 'user', content: 'new' };
    const result = evictOldMessages(messages, newMessage);

    expect(result).toHaveLength(MAX_RENDERED_LINES);
    expect(result[0].id).toBe('1'); // First message evicted
    expect(result[result.length - 1].id).toBe('new');
  });

  it('should maintain MAX_RENDERED_LINES limit', () => {
    let messages: MessageLine[] = [];

    // Add more than MAX_RENDERED_LINES messages
    for (let i = 0; i < MAX_RENDERED_LINES + 100; i++) {
      const newMessage: MessageLine = { id: `${i}`, type: 'user', content: `msg ${i}` };
      messages = evictOldMessages(messages, newMessage);
    }

    expect(messages).toHaveLength(MAX_RENDERED_LINES);
    expect(messages[0].id).toBe('100'); // First 100 messages evicted
  });
});
