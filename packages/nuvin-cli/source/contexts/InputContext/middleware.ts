import type { InputMiddleware } from './types.js';
import { eventBus } from '@/services/EventBus.js';

export const ctrlCMiddleware: InputMiddleware = (input, key, next) => {
  if (key.ctrl && input === 'c') {
    eventBus.emit('ui:keyboard:ctrlc', undefined);
    return;
  }
  next();
};

export const pasteDetectionMiddleware: InputMiddleware = (input, key, next) => {
  if (input.startsWith('\x1b[200~') || input.startsWith('[200~')) {
    eventBus.emit('ui:keyboard:paste', undefined);
  } else if (key.ctrl && input === 'v') {
    eventBus.emit('ui:keyboard:paste', undefined);
  }
  next();
};

export const focusCycleMiddleware: InputMiddleware = (_input, key, next) => {
  if (key.tab && !key.shift) {
    eventBus.emit('ui:focus:cycle', 'forward');
  }
  if (key.shift && key.tab) {
    eventBus.emit('ui:focus:cycle', 'backward');
  }
  next();
};

export const defaultMiddleware: InputMiddleware[] = [
  ctrlCMiddleware,
  pasteDetectionMiddleware,
  focusCycleMiddleware,
];
