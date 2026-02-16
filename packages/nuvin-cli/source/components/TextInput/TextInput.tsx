import React from 'react';
import type { Except } from 'type-fest';
import type { LineInfo } from '@/utils/textNavigation.js';
import { useStdoutDimensionsContext } from '@/contexts/StdoutDimensionsContext.js';
import { useVimMode } from './useVimMode.js';
import { usePaste } from './usePaste.js';
import { useEditorState } from './useEditorState.js';
import { useLineIndex } from './useLineIndex.js';
import { useCursorBlink } from './useCursorBlink.js';
import { useTextInputLayout } from './useTextInputLayout.js';
import { useVisualRows } from './useVisualRows.js';
import { useTextInputScroll } from './useTextInputScroll.js';
import { useInputHandler } from './useInputHandler.js';
import { useTextInputDebugLogger } from './debugLogger.js';
import { TextInputRenderer } from './TextInputRenderer.js';

export type { LineInfo };

// Re-export width utilities for backward compatibility (used by tests)
export { computeEffectiveWidth, stabilizeEffectiveWidth, resolveRenderedCursorColumn } from './widthUtils.js';

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
  readonly onUpArrow?: (lineInfo: LineInfo) => void;
  readonly onDownArrow?: (lineInfo: LineInfo) => void;
  readonly onTab?: (
    value: string,
    cursorOffset: number,
    isShiftTab: boolean,
  ) => { value: string; cursorOffset: number } | undefined;
  readonly maxLines?: number;
  readonly showScrollbar?: boolean;
  readonly scrollbarColor?: string;
  readonly scrollbarTrackColor?: string;
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
  onUpArrow,
  onDownArrow,
  onTab,
  maxLines,
  showScrollbar = true,
  scrollbarColor,
  scrollbarTrackColor,
}: Props) {
  const { cols } = useStdoutDimensionsContext();

  const { measureRef, scrollRef, effectiveWidth, containerWidth, scrollBoxWidth } = useTextInputLayout({
    showScrollbar,
    maxLines,
  });

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
  const lineIndex = useLineIndex(editorState.value);
  const cursorVisible = useCursorBlink(editorState.value, editorState.cursorOffset);

  const { lines, visualRows, cursorInfo } = useVisualRows({
    value: editorState.value,
    cursorOffset: editorState.cursorOffset,
    mask,
    effectiveWidth,
    maxLines,
    lineIndex,
  });

  const visualLineCount = visualRows.length;

  const { scrollOffset, scrollRatio, visibleRatio, hasScrolling, visibleLines } = useTextInputScroll({
    scrollRef,
    maxLines,
    visualLineCount,
    cursorVisualRow: cursorInfo.visualRow,
  });

  useInputHandler({
    focus,
    showCursor,
    effectiveWidth,
    vimModeEnabled,
    vimMode,
    editorState,
    lineIndex,
    setValue,
    moveCursor,
    setInitialCursor,
    handleVimInput,
    enterInsertMode,
    processPaste,
    onChange,
    onSubmit,
    onUpArrow,
    onDownArrow,
    onTab,
  });

  useTextInputDebugLogger({
    editorValue: editorState.value,
    editorCursorOffset: editorState.cursorOffset,
    cols,
    containerWidth,
    scrollBoxWidth,
    effectiveWidth,
    maxLines,
    lines,
    visualRows,
    visualLineCount,
    hasScrolling,
    visibleLines,
    scrollOffset,
    cursorInfo,
    lineIndex,
  });

  return (
    <TextInputRenderer
      measureRef={measureRef}
      scrollRef={scrollRef}
      value={editorState.value}
      placeholder={placeholder}
      focus={focus}
      showCursor={showCursor}
      cursorVisible={cursorVisible}
      visualRows={visualRows}
      cursorInfo={cursorInfo}
      hasScrolling={hasScrolling}
      maxLines={maxLines}
      showScrollbar={showScrollbar}
      scrollRatio={scrollRatio}
      visibleRatio={visibleRatio}
      scrollbarColor={scrollbarColor}
      scrollbarTrackColor={scrollbarTrackColor}
    />
  );
}

export default TextInput;

type UncontrolledProps = {
  readonly initialValue?: string;
} & Except<Props, 'value' | 'onChange'>;

export function UncontrolledTextInput({ initialValue = '', ...props }: UncontrolledProps) {
  const [value, setValue] = React.useState(initialValue);
  return <TextInput {...props} value={value} onChange={setValue} />;
}
