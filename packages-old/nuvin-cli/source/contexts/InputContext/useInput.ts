import { useEffect, useRef, useContext } from 'react';
import { InputContext } from './InputContext.js';
import type { InputHandler, UseInputOptions } from './types.js';

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
export const useInput = (handler: InputHandler, options: UseInputOptions = {}) => {
  const { subscribe } = useContext(InputContext);
  const handlerRef = useRef(handler);
  const { isActive = true, priority } = options;

  useEffect(() => {
    handlerRef.current = handler;
  });

  useEffect(() => {
    if (!isActive) return;

    const wrappedHandler: InputHandler = (input, key) => {
      return handlerRef.current(input, key);
    };

    return subscribe(wrappedHandler, { isActive, priority });
  }, [subscribe, isActive, priority]);
};

export type { Key } from './types.js';
