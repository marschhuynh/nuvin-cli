import { createContext } from 'react';
import type { InputContextValue } from './types.js';

const noop = () => () => {};

export const InputContext = createContext<InputContextValue>({
  subscribe: noop,
  subscribeMouse: noop,
  updateSubscriber: () => {},
  addMiddleware: noop,
  setRawMode: () => {},
  isRawModeSupported: false,
  enableMouseMode: () => {},
  disableMouseMode: () => {},
  isMouseModeEnabled: false,
});

InputContext.displayName = 'InputContext';
