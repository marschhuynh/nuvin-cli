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
/** Configure middleware callbacks. Called once during InputSetup mount. */
export declare function setMiddlewareCallbacks(cb: MiddlewareCallbacks): void;
export declare const ctrlCMiddleware: InputMiddleware;
export declare const pasteDetectionMiddleware: InputMiddleware;
export declare const focusCycleMiddleware: InputMiddleware;
export declare const defaultMiddleware: InputMiddleware[];
//# sourceMappingURL=middleware.d.ts.map