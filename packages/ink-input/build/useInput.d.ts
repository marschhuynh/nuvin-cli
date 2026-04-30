import type { InputHandler, UseInputOptions } from "./types.js";
/**
 * Hook to subscribe to keyboard input events.
 *
 * @param handler - Function called when input is received. Return true to stop propagation.
 * @param options - Configuration options:
 *   - isActive: Whether this handler is active (default: true)
 *   - priority: Explicit priority (higher = first). If omitted, uses auto-increment.
 *
 * @example
 * ```tsx
 * useInput((input, key) => {
 *   if (key.escape) {
 *     onClose();
 *     return true; // Stop propagation
 *   }
 * }, { isActive: isVisible });
 * ```
 */
export declare const useInput: (handler: InputHandler, options?: UseInputOptions) => void;
export type { Key } from "./types.js";
//# sourceMappingURL=useInput.d.ts.map