export type Key = {
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  pageDown: boolean;
  pageUp: boolean;
  home: boolean;
  end: boolean;
  return: boolean;
  escape: boolean;
  ctrl: boolean;
  shift: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
  meta: boolean;
};

export type MouseEventType = 'click' | 'wheel-up' | 'wheel-down' | 'release' | 'drag' | 'move';

export type MouseEvent = {
  type: MouseEventType;
  button: number;
  x: number;
  y: number;
  count?: number;
};

/**
 * Input handler function that processes keyboard input.
 * @param input - The raw input string
 * @param key - Parsed key information (ctrl, shift, meta, etc.)
 * @returns true to stop propagation, false/undefined to continue to lower priority handlers
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is intentional for handlers that don't need to return
export type InputHandler = (input: string, key: Key) => void | boolean;

/**
 * Mouse event handler function that processes mouse events.
 * @param event - The mouse event details
 * @returns true to stop propagation, false/undefined to continue to lower priority handlers
 */
// biome-ignore lint/suspicious/noConfusingVoidType: void is intentional for handlers that don't need to return
export type MouseHandler = (event: MouseEvent) => void | boolean;

/**
 * Middleware that can intercept and modify input before it reaches handlers.
 * Must call next() to continue the chain.
 */
export type InputMiddleware = (input: string, key: Key, next: () => void) => void;

export type Subscriber = {
  id: string;
  handler: InputHandler;
  priority: number;
  isActive: boolean;
};

export type MouseSubscriber = {
  id: string;
  handler: MouseHandler;
  priority: number;
  isActive: boolean;
};

/**
 * Options for configuring input subscription behavior.
 *
 * @property isActive - Whether the handler is active (default: true)
 * @property priority - Handler priority. Higher values execute first.
 *                      If not specified, uses auto-increment (later registrations = higher priority)
 */
export type UseInputOptions = {
  isActive?: boolean;
  priority?: number;
};

/**
 * Options for configuring mouse subscription behavior.
 *
 * @property isActive - Whether the handler is active (default: true)
 * @property priority - Handler priority. Higher values execute first.
 *                      If not specified, uses auto-increment (later registrations = higher priority)
 */
export type UseMouseOptions = {
  isActive?: boolean;
  priority?: number;
};

export type InputContextValue = {
  subscribe: (handler: InputHandler, options?: UseInputOptions) => () => void;
  subscribeMouse: (handler: MouseHandler, options?: UseMouseOptions) => () => void;
  updateSubscriber: (id: string, options: Partial<UseInputOptions>) => void;
  addMiddleware: (middleware: InputMiddleware) => () => void;
  setRawMode: (value: boolean) => void;
  isRawModeSupported: boolean;
  enableMouseMode: () => void;
  disableMouseMode: () => void;
  isMouseModeEnabled: boolean;
};
