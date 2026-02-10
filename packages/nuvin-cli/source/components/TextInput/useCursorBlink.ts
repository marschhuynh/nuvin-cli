import { useEffect, useRef, useSyncExternalStore } from 'react';

const CURSOR_INACTIVITY_THRESHOLD_MS = 300;
const CURSOR_BLINK_INTERVAL_MS = 530;

let cursorVisible = true;
let lastActivityTime = performance.now();
const subscribers = new Set<() => void>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function subscribe(callback: () => void) {
  subscribers.add(callback);
  if (intervalId === null && subscribers.size > 0) {
    intervalId = setInterval(() => {
      const timeSinceActivity = performance.now() - lastActivityTime;
      if (timeSinceActivity > CURSOR_INACTIVITY_THRESHOLD_MS) {
        cursorVisible = !cursorVisible;
        for (const cb of subscribers) cb();
      }
    }, CURSOR_BLINK_INTERVAL_MS);
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
  lastActivityTime = performance.now();
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
      resetActivity();
    }
  }, [value, cursorOffset]);

  return isVisible;
}
