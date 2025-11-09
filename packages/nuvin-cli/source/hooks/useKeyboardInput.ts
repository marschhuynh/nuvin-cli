import { useInput } from 'ink';
import { eventBus } from '@/services/EventBus.js';

export const useKeyboardInput = (): void => {
  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      eventBus.emit('ui:keyboard:ctrlc', undefined);
      return;
    }

    const isPasteCommand = _input === '\u0016' || ((_input === 'v' || _input === 'V') && (key.ctrl || key.meta));

    if (isPasteCommand) {
      eventBus.emit('ui:keyboard:paste', undefined);
      return;
    }
  });
};
