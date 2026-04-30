/**
 * inputStore — Zustand store replacing InputContext + InputProvider.
 *
 * Manages keyboard and mouse input distribution to subscribers.
 * All refs from InputProvider become store state; all callbacks become actions.
 *
 * Features:
 * - Priority-based event distribution (higher priority = executed first)
 * - Auto-incrementing priority for declarative component order
 * - Middleware chain for preprocessing input
 * - Mouse mode support with reference counting
 * - Sorted subscriber cache with dirty flags for performance
 */
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";
import { InputStreamDecoder } from "./InputStreamDecoder.js";
import { parseKeypress, parseMouseEvent } from "./parseKeypress.js";
const ESC_FLUSH_DELAY_MS = 35;
const MOUSE_MODE_ENABLE = "\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h";
const MOUSE_MODE_DISABLE = "\x1b[?1006l\x1b[?1003l\x1b[?1002l\x1b[?1000l";
// Internal mutable state — NOT in Zustand reactive state (no re-renders needed)
// These are the equivalent of useRef() in the v1 InputProvider.
const subscribers = new Map();
const mouseSubscribers = new Map();
let middleware = [];
let idCounter = 0;
let priorityStackCounter = 0;
let mouseEnableCount = 0;
const decoder = new InputStreamDecoder();
let escapeFlushTimer = null;
let stdout = null;
// Sorted subscriber caches (rebuilt only when dirty)
let sortedSubscribersCache = [];
let sortedMouseSubscribersCache = [];
let subscribersDirty = true;
let mouseSubscribersDirty = true;
function clearEscapeFlushTimer() {
    if (escapeFlushTimer) {
        clearTimeout(escapeFlushTimer);
        escapeFlushTimer = null;
    }
}
/**
 * Distribute input to all active subscribers in priority order.
 * Stops when a handler returns true.
 * Uses cached sorted list that's only rebuilt when subscribers change.
 */
function distributeInput(input, key) {
    if (subscribersDirty) {
        sortedSubscribersCache = Array.from(subscribers.values())
            .filter((s) => s.isActive)
            .sort((a, b) => b.priority - a.priority);
        subscribersDirty = false;
    }
    for (const subscriber of sortedSubscribersCache) {
        const result = subscriber.handler(input, key);
        if (result === true)
            break;
    }
}
/**
 * Distribute mouse events to all active subscribers in priority order.
 * Stops when a handler returns true.
 */
function distributeMouse(event) {
    if (mouseSubscribersDirty) {
        sortedMouseSubscribersCache = Array.from(mouseSubscribers.values())
            .filter((s) => s.isActive)
            .sort((a, b) => b.priority - a.priority);
        mouseSubscribersDirty = false;
    }
    for (const subscriber of sortedMouseSubscribersCache) {
        const result = subscriber.handler(event);
        if (result === true)
            break;
    }
}
/**
 * Parse a single chunk and run it through the middleware chain,
 * then distribute to subscribers.
 */
function dispatchParsedChunk(chunk) {
    const { input, key } = parseKeypress(chunk);
    let index = 0;
    const next = () => {
        if (index < middleware.length) {
            const currentMiddleware = middleware[index];
            index++;
            currentMiddleware?.(input, key, next);
        }
        else {
            distributeInput(input, key);
        }
    };
    next();
}
export const inputStore = createStore()((set, _get) => ({
    // Reactive state (triggers re-renders when changed)
    isMouseModeEnabled: false,
    init: (stdoutStream) => {
        stdout = stdoutStream;
        if (mouseEnableCount > 0) {
            stdout.write(MOUSE_MODE_ENABLE);
            set({ isMouseModeEnabled: true });
        }
    },
    cleanup: () => {
        clearEscapeFlushTimer();
        decoder.clear();
        if (stdout && mouseEnableCount > 0) {
            stdout.write(MOUSE_MODE_DISABLE);
        }
        mouseEnableCount = 0;
        set({ isMouseModeEnabled: false });
    },
    /**
     * Subscribe to keyboard input events.
     *
     * Priority system:
     * - If priority is explicitly set, that value is used
     * - If not set, priority auto-increments (later registrations = higher priority)
     * - This means components lower in the tree naturally take precedence
     */
    subscribe: (handler, options = {}) => {
        const id = `input_sub_${++idCounter}`;
        const priority = options.priority ?? ++priorityStackCounter;
        const subscriber = {
            id,
            handler,
            priority,
            isActive: options.isActive ?? true,
        };
        subscribers.set(id, subscriber);
        subscribersDirty = true;
        return () => {
            subscribers.delete(id);
            subscribersDirty = true;
        };
    },
    /**
     * Subscribe to mouse events.
     * Uses same priority system as keyboard input.
     */
    subscribeMouse: (handler, options = {}) => {
        const id = `mouse_sub_${++idCounter}`;
        const priority = options.priority ?? ++priorityStackCounter;
        const subscriber = {
            id,
            handler,
            priority,
            isActive: options.isActive ?? true,
        };
        mouseSubscribers.set(id, subscriber);
        mouseSubscribersDirty = true;
        return () => {
            mouseSubscribers.delete(id);
            mouseSubscribersDirty = true;
        };
    },
    updateSubscriber: (id, options) => {
        const subscriber = subscribers.get(id) || mouseSubscribers.get(id);
        if (subscriber) {
            if (options.isActive !== undefined) {
                subscriber.isActive = options.isActive;
                subscribersDirty = true;
                mouseSubscribersDirty = true;
            }
            if (options.priority !== undefined) {
                subscriber.priority = options.priority;
                subscribersDirty = true;
                mouseSubscribersDirty = true;
            }
        }
    },
    addMiddleware: (mw) => {
        middleware.push(mw);
        return () => {
            const index = middleware.indexOf(mw);
            if (index !== -1) {
                middleware.splice(index, 1);
            }
        };
    },
    enableMouseMode: () => {
        mouseEnableCount++;
        if (mouseEnableCount === 1 && stdout) {
            stdout.write(MOUSE_MODE_ENABLE);
            set({ isMouseModeEnabled: true });
        }
    },
    disableMouseMode: () => {
        mouseEnableCount = Math.max(0, mouseEnableCount - 1);
        if (mouseEnableCount === 0 && stdout) {
            stdout.write(MOUSE_MODE_DISABLE);
            set({ isMouseModeEnabled: false });
        }
    },
    /**
     * Main input pipeline — called by InputSetup when data arrives from stdin.
     * Handles mouse detection, stream decoding, escape flush, and dispatch.
     */
    handleInput: (data) => {
        clearEscapeFlushTimer();
        const combinedData = decoder.getCombinedData(data);
        const { mouse, consumed, events, unconsumed, remainder } = parseMouseEvent(combinedData);
        if (consumed && mouse) {
            // Dispatch mouse events
            if (events && events.length > 1 && !mouse.count) {
                // Multiple non-wheel events (click/drag/release): dispatch each individually
                for (const event of events) {
                    distributeMouse(event);
                }
            }
            else {
                // Single event or aggregated wheel: dispatch the primary
                distributeMouse(mouse);
            }
            // Process leftover data: unconsumed keyboard data + incomplete trailing sequences
            const leftover = (unconsumed || "") + (remainder || "");
            if (leftover) {
                decoder.clear();
                const { chunks, hasPendingEscape } = decoder.feedCombinedData(leftover);
                for (const chunk of chunks) {
                    dispatchParsedChunk(chunk);
                }
                if (hasPendingEscape) {
                    escapeFlushTimer = setTimeout(() => {
                        escapeFlushTimer = null;
                        for (const chunk of decoder.flushPendingEscape()) {
                            dispatchParsedChunk(chunk);
                        }
                    }, ESC_FLUSH_DELAY_MS);
                }
            }
            else {
                decoder.clear();
            }
            return;
        }
        const { chunks, hasPendingEscape } = decoder.feedCombinedData(combinedData);
        for (const chunk of chunks) {
            dispatchParsedChunk(chunk);
        }
        if (hasPendingEscape) {
            escapeFlushTimer = setTimeout(() => {
                escapeFlushTimer = null;
                for (const chunk of decoder.flushPendingEscape()) {
                    dispatchParsedChunk(chunk);
                }
            }, ESC_FLUSH_DELAY_MS);
        }
    },
}));
/**
 * Set the middleware stack (replaces existing middleware).
 * Called once during InputSetup mount.
 */
export function setMiddleware(mw) {
    middleware = [...mw];
}
/**
 * Reset all internal mutable state. Used for testing.
 */
export function resetInputStore() {
    clearEscapeFlushTimer();
    decoder.clear();
    subscribers.clear();
    mouseSubscribers.clear();
    middleware = [];
    idCounter = 0;
    priorityStackCounter = 0;
    mouseEnableCount = 0;
    stdout = null;
    sortedSubscribersCache = [];
    sortedMouseSubscribersCache = [];
    subscribersDirty = true;
    mouseSubscribersDirty = true;
    inputStore.setState({ isMouseModeEnabled: false });
}
/** React hook for accessing input store state + actions. */
export function useInputStore() {
    return useStore(inputStore);
}
/** React hook — select specific slice from input store. */
export function useInputStoreSelect(selector) {
    return useStore(inputStore, selector);
}
//# sourceMappingURL=input.js.map