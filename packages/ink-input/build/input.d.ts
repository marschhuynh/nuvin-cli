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
import type { InputHandler, InputMiddleware, MouseHandler, UseInputOptions, UseMouseOptions } from "./types.js";
type InputState = {
    isMouseModeEnabled: boolean;
};
type InputActions = {
    subscribe: (handler: InputHandler, options?: UseInputOptions) => () => void;
    subscribeMouse: (handler: MouseHandler, options?: UseMouseOptions) => () => void;
    updateSubscriber: (id: string, options: Partial<UseInputOptions>) => void;
    addMiddleware: (middleware: InputMiddleware) => () => void;
    enableMouseMode: () => void;
    disableMouseMode: () => void;
    handleInput: (data: string) => void;
    init: (stdout: NodeJS.WriteStream) => void;
    cleanup: () => void;
};
export declare const inputStore: import("zustand").StoreApi<InputState & InputActions>;
/**
 * Set the middleware stack (replaces existing middleware).
 * Called once during InputSetup mount.
 */
export declare function setMiddleware(mw: InputMiddleware[]): void;
/**
 * Reset all internal mutable state. Used for testing.
 */
export declare function resetInputStore(): void;
/** React hook for accessing input store state + actions. */
export declare function useInputStore(): InputState & InputActions;
/** React hook — select specific slice from input store. */
export declare function useInputStoreSelect<T>(selector: (state: InputState & InputActions) => T): T;
export {};
//# sourceMappingURL=input.d.ts.map