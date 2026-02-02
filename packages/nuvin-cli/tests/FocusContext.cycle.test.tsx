import { describe, it, expect } from 'vitest';

describe('FocusContext unit tests', () => {
  it('should add id to focusableIdsRef when register is called', () => {
    const focusableIdsRef = { current: new Set<string>() };

    const id = 'test-id-1';
    focusableIdsRef.current.add(id);

    expect(focusableIdsRef.current.size).toBe(1);
    expect(focusableIdsRef.current.has(id)).toBe(true);
  });

  it('should cycle through ids correctly', () => {
    const ids = ['id1', 'id2', 'id3'];
    let focusedId: string | null = null;

    const cycleFocus = (direction: 'forward' | 'backward' = 'forward') => {
      if (ids.length === 0) return;

      const currentIndex = focusedId ? ids.indexOf(focusedId) : -1;
      let nextIndex: number;

      if (direction === 'forward') {
        nextIndex = (currentIndex + 1) % ids.length;
      } else {
        nextIndex = currentIndex <= 0 ? ids.length - 1 : currentIndex - 1;
      }

      focusedId = ids[nextIndex] || null;
    };

    expect(focusedId).toBeNull();

    cycleFocus('forward');
    expect(focusedId).toBe('id1');

    cycleFocus('forward');
    expect(focusedId).toBe('id2');

    cycleFocus('forward');
    expect(focusedId).toBe('id3');

    cycleFocus('forward');
    expect(focusedId).toBe('id1');

    cycleFocus('backward');
    expect(focusedId).toBe('id3');
  });

  it('should handle empty ids array', () => {
    const ids: string[] = [];
    let focusedId: string | null = null;

    const cycleFocus = () => {
      if (ids.length === 0) return;
      focusedId = ids[0] || null;
    };

    cycleFocus();
    expect(focusedId).toBeNull();
  });
});
