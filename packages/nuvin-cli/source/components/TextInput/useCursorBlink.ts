import { useEffect, useRef, useSyncExternalStore } from 'react';

let cursorVisible = true;
let lastActivityTime = Date.now();
const subscribers = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function subscribe(callback: () => void) {
  subscribers.add(callback);
  if (intervalId === null && subscribers.size > 0) {
    intervalId = setInterval(() => {
      const timeSinceActivity = Date.now() - lastActivityTime;
      if (timeSinceActivity > 300) {
        cursorVisible = !cursorVisible;
        for (const cb of subscribers) cb();
      }
    }, 530);
  }
  return () => {
    subscribers.delete(callback);
    if (subscribers.size === 0 && intervalId !== null) {
      clearInterval(intervalId);
      intervalId = null;
    }
  };
}

function getSnapshot() {
  return cursorVisible;
}

function resetActivity() {
  lastActivityTime = Date.now();
  if (!cursorVisible) {
    cursorVisible = true;
    for (const cb of subscribers) cb();
  }
}

export function useCursorBlink(value: string, cursorOffset: number) {
  const isVisible = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const lastValueRef = useRef<string>('');
  const lastOffsetRef = useRef<number>(0);

  useEffect(() => {
    if (value !== lastValueRef.current || cursorOffset !== lastOffsetRef.current) {
      lastValueRef.current = value;
      lastOffsetRef.current = cursorOffset;
      queueMicrotask(resetActivity);
    }
  }, [value, cursorOffset]);

  return isVisible;
}
