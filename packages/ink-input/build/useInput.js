/**
 * useInput — Hook to subscribe to keyboard input events.
 *
 * Replaces the v1 useInput that used React Context with a Zustand store subscription.
 * Same API: handler receives (input, key) and can return true to stop propagation.
 */
import { useEffect, useRef } from "react";
import { inputStore } from "./input.js";
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
export const useInput = (handler, options = {}) => {
    const handlerRef = useRef(handler);
    const { isActive = true, priority } = options;
    useEffect(() => {
        handlerRef.current = handler;
    });
    useEffect(() => {
        if (!isActive)
            return;
        const wrappedHandler = (input, key) => {
            return handlerRef.current(input, key);
        };
        return inputStore.getState().subscribe(wrappedHandler, { isActive, priority });
    }, [isActive, priority]);
};
//# sourceMappingURL=useInput.js.map