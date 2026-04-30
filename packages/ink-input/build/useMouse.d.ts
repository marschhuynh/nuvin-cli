import type { MouseHandler, UseMouseOptions } from "./types.js";
/**
 * Hook to subscribe to mouse events.
 * Automatically enables mouse mode when mounted and disables when unmounted.
 *
 * @param handler - Function called when mouse events are received. Return true to stop propagation.
 * @param options - Configuration options:
 *   - isActive: Whether this handler is active (default: true)
 *   - priority: Explicit priority (higher = first). If omitted, uses auto-increment.
 *
 * @example
 * ```tsx
 * useMouse((event) => {
 *   if (event.type === 'click') {
 *     handleClick(event.x, event.y);
 *     return true;
 *   }
 * });
 * ```
 */
export declare const useMouse: (handler: MouseHandler, options?: UseMouseOptions) => void;
export type { MouseEvent } from "./types.js";
//# sourceMappingURL=useMouse.d.ts.map