import { useEffect, useState } from 'react';
import { Text, useInput } from 'ink';
import type { Except } from 'type-fest';
import { eventBus } from '@/services/EventBus.js';
import { moveCursorVertically } from '@/utils/textNavigation.js';
import { useVimMode } from './useVimMode.js';
import { usePaste } from './usePaste.js';
import { useCursorRenderer } from './useCursorRenderer.js';
import { useEditorState } from './useEditorState.js';

export type Props = {
  readonly placeholder?: string;
  readonly focus?: boolean;
  readonly mask?: string;
  readonly showCursor?: boolean;
  readonly highlightPastedText?: boolean;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onSubmit?: (value: string) => void;
  readonly vimModeEnabled?: boolean;
  readonly onVimModeChange?: (mode: 'insert' | 'normal') => void;
};

function TextInput({
  value: originalValue,
  placeholder = '',
  focus = true,
  mask,
  showCursor = true,
  onChange,
  onSubmit,
  vimModeEnabled = false,
  onVimModeChange,
}: Props) {
  const {
    mode: vimMode,
    handleVimInput,
    enterInsertMode,
  } = useVimMode({
    enabled: vimModeEnabled,
    onModeChange: onVimModeChange,
  });

  const {
    state: editorState,
    setValue,
    moveCursor,
    setInitialCursor,
  } = useEditorState({
    initialValue: originalValue,
    vimMode,
    onChange,
  });

  const { processPaste } = usePaste();
  const { renderWithCursor } = useCursorRenderer();

  useEffect(() => {
    setInitialCursor(focus);
  }, [focus, setInitialCursor]);

  useInput(
    (input, key) => {
      const pasteResult = processPaste(input);

      if (pasteResult.shouldWaitForMore) {
        return;
      }

      if (pasteResult.isPasteStart) {
        eventBus.emit('ui:keyboard:paste', undefined);
      }

      if (pasteResult.processedInput !== null) {
        input = pasteResult.processedInput;
      }

      const currentCursorOffset = editorState.cursorOffset;
      const currentValue = editorState.value;
      const vimAction = handleVimInput(input, key, currentValue, currentCursorOffset);

      if (vimAction.type === 'move-cursor') {
        moveCursor(vimAction.offset);
        return;
      }

      if (vimAction.type === 'set-value') {
        setValue(vimAction.value, vimAction.offset);
        return;
      }

      if (vimAction.type === 'enter-insert-and-set-value') {
        setValue(vimAction.value, vimAction.offset);
        enterInsertMode();
        return;
      }

      if (vimAction.type === 'enter-insert-mode') {
        enterInsertMode();
        if (vimAction.offset !== undefined) {
          moveCursor(vimAction.offset);
        }
        return;
      }

      if (vimAction.type === 'submit') {
        if (onSubmit) {
          onSubmit(currentValue);
        }
        return;
      }

      if (vimAction.type !== 'none') {
        return;
      }

      if (vimModeEnabled && vimMode === 'normal') {
        return;
      }

      if (key.meta && input === '\u0003') {
        onChange('copied');
        return;
      }

      if ((key.ctrl && input === 'c') || (key.ctrl && input === 'v') || key.tab || (key.shift && key.tab)) {
        return;
      }

      if (key.return) {
        if (onSubmit) {
          onSubmit(currentValue);
        }
        return;
      }

      if (key.leftArrow) {
        if (showCursor) {
          moveCursor(currentCursorOffset - 1);
        }
      } else if (key.rightArrow) {
        if (showCursor) {
          moveCursor(currentCursorOffset + 1);
        }
      } else if (key.upArrow) {
        if (!showCursor) {
          return;
        }
        const target = moveCursorVertically(currentValue, currentCursorOffset, 'up');
        if (target !== null) {
          moveCursor(target);
        }
      } else if (key.downArrow) {
        if (!showCursor) {
          return;
        }
        const target = moveCursorVertically(currentValue, currentCursorOffset, 'down');
        if (target !== null) {
          moveCursor(target);
        }
      } else if (key.backspace || key.delete) {
        if (currentCursorOffset > 0) {
          const nextValue =
            currentValue.slice(0, currentCursorOffset - 1) +
            currentValue.slice(currentCursorOffset, currentValue.length);
          const nextCursorOffset = currentCursorOffset - 1;
          setValue(nextValue, nextCursorOffset);
        }
      } else {
        const nextValue =
          currentValue.slice(0, currentCursorOffset) +
          input +
          currentValue.slice(currentCursorOffset, currentValue.length);
        const nextCursorOffset = currentCursorOffset + input.length;
        const nextCursorWidth = input.length > 1 ? input.length : 0;

        setValue(nextValue, nextCursorOffset, nextCursorWidth);
      }
    },
    { isActive: focus },
  );

  const value = mask ? mask.repeat(editorState.value.length) : editorState.value;
  const { renderedValue, renderedPlaceholder } = renderWithCursor(
    value,
    editorState.cursorOffset,
    placeholder,
    showCursor,
    focus,
  );

  return <Text>{placeholder ? (value.length > 0 ? renderedValue : renderedPlaceholder) : renderedValue}</Text>;
}

export default TextInput;

type UncontrolledProps = {
  readonly initialValue?: string;
} & Except<Props, 'value' | 'onChange'>;

export function UncontrolledTextInput({ initialValue = '', ...props }: UncontrolledProps) {
  const [value, setValue] = useState(initialValue);

  return <TextInput {...props} value={value} onChange={setValue} />;
}
