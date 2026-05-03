export type EditResult = {
  value: string;
  cursorOffset: number;
};

export function applyBackspace(value: string, cursorOffset: number): EditResult | null {
  if (cursorOffset <= 0 || value.length === 0) {
    return null;
  }

  const removalIndex = cursorOffset - 1;
  return {
    value: value.slice(0, removalIndex) + value.slice(cursorOffset),
    cursorOffset: removalIndex,
  };
}

export function applyDelete(value: string, cursorOffset: number): EditResult | null {
  if (value.length === 0 || cursorOffset >= value.length) {
    return null;
  }

  return {
    value: value.slice(0, cursorOffset) + value.slice(cursorOffset + 1),
    cursorOffset,
  };
}
