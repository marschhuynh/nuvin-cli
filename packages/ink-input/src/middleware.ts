/**
 * Input middleware — intercepts keystrokes before they reach subscribers.
 *
 * Instead of emitting to an EventBus (v1), middleware signals are dispatched
 * via callbacks provided at setup time. This keeps the input system
 * decoupled from any specific event infrastructure.
 */
import type { InputMiddleware } from "./types.js";

export type MiddlewareCallbacks = {
  onCtrlC?: () => void;
  onPaste?: () => void;
  onFocusCycle?: (direction: "forward" | "backward") => void;
};

let callbacks: MiddlewareCallbacks = {};

/** Configure middleware callbacks. Called once during InputSetup mount. */
export function setMiddlewareCallbacks(cb: MiddlewareCallbacks): void {
  callbacks = cb;
}

export const ctrlCMiddleware: InputMiddleware = (input, key, next) => {
  if (key.ctrl && input === "c") {
    callbacks.onCtrlC?.();
  }
  next();
};

export const pasteDetectionMiddleware: InputMiddleware = (input, key, next) => {
  if (input.startsWith("\x1b[200~") || input.startsWith("[200~")) {
    callbacks.onPaste?.();
  } else if (key.ctrl && input === "v") {
    callbacks.onPaste?.();
  }
  next();
};

export const focusCycleMiddleware: InputMiddleware = (_input, key, next) => {
  if (key.tab && !key.shift) {
    callbacks.onFocusCycle?.("forward");
  }
  if (key.shift && key.tab) {
    callbacks.onFocusCycle?.("backward");
  }
  next();
};

export const defaultMiddleware: InputMiddleware[] = [
  ctrlCMiddleware,
  pasteDetectionMiddleware,
  focusCycleMiddleware,
];
