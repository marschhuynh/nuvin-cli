import { useEffect, useRef, useSyncExternalStore } from "react";
const CURSOR_INACTIVITY_THRESHOLD_MS = 300;
const CURSOR_BLINK_INTERVAL_MS = 530;
let cursorVisible = true;
let lastActivityTime = performance.now();
const subscribers = new Set();
let intervalId = null;
function subscribe(callback) {
    subscribers.add(callback);
    if (intervalId === null && subscribers.size > 0) {
        intervalId = setInterval(() => {
            const timeSinceActivity = performance.now() - lastActivityTime;
            if (timeSinceActivity > CURSOR_INACTIVITY_THRESHOLD_MS) {
                cursorVisible = !cursorVisible;
                for (const cb of subscribers)
                    cb();
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
        for (const cb of subscribers)
            cb();
    }
}
export function useCursorBlink(value, cursorOffset) {
    const isVisible = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    const lastValueRef = useRef("");
    const lastOffsetRef = useRef(0);
    useEffect(() => {
        if (value !== lastValueRef.current || cursorOffset !== lastOffsetRef.current) {
            lastValueRef.current = value;
            lastOffsetRef.current = cursorOffset;
            resetActivity();
        }
    }, [value, cursorOffset]);
    return isVisible;
}
//# sourceMappingURL=useCursorBlink.js.map