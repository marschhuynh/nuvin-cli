import { useEffect, useRef, useContext } from 'react';
import { InputContext } from './InputContext.js';
import type { MouseHandler, UseMouseOptions } from './types.js';

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
export const useMouse = (handler: MouseHandler, options: UseMouseOptions = {}) => {
  const { subscribeMouse, enableMouseMode, disableMouseMode } = useContext(InputContext);
  const handlerRef = useRef(handler);
  const { isActive = true, priority } = options;

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!isActive) return;

    enableMouseMode();

    const wrappedHandler: MouseHandler = (event) => {
      return handlerRef.current(event);
    };

    const unsubscribe = subscribeMouse(wrappedHandler, {
      isActive,
      priority,
    });

    return () => {
      unsubscribe();
      disableMouseMode();
    };
  }, [subscribeMouse, enableMouseMode, disableMouseMode, isActive, priority]);
};

export type { MouseEvent } from './types.js';
