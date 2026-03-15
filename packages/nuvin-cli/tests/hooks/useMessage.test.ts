// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useMessages from '../../source/hooks/useMessage.js';

describe('useMessages - deleteMessages', () => {
  it('deletes a single message by id', () => {
    const { result } = renderHook(() => useMessages());

    act(() => {
      result.current.appendLine({ id: 'msg1', type: 'user', content: 'Hello' });
      result.current.appendLine({ id: 'msg2', type: 'assistant', content: 'Hi' });
    });

    act(() => {
      result.current.deleteMessages(['msg1']);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].id).toBe('msg2');
  });

  it('deletes multiple messages by id', () => {
    const { result } = renderHook(() => useMessages());

    act(() => {
      result.current.appendLine({ id: 'msg1', type: 'user', content: 'A' });
      result.current.appendLine({ id: 'msg2', type: 'assistant', content: 'B' });
      result.current.appendLine({ id: 'msg3', type: 'user', content: 'C' });
    });

    act(() => {
      result.current.deleteMessages(['msg1', 'msg3']);
    });

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].id).toBe('msg2');
  });

  it('is a no-op for unknown ids', () => {
    const { result } = renderHook(() => useMessages());

    act(() => {
      result.current.appendLine({ id: 'msg1', type: 'user', content: 'Hello' });
    });

    act(() => {
      result.current.deleteMessages(['nonexistent']);
    });

    expect(result.current.messages).toHaveLength(1);
  });
});
