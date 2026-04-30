import { useState, useEffect } from 'react';
import type { CompleteCustomCommand } from '@nuvin/nuvin-core';

export interface CommandModalState {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
}

export const useCommandModalState = (
  commands: CompleteCustomCommand[],
  initialSelectedIndex?: number,
): CommandModalState => {
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (initialSelectedIndex !== undefined && initialSelectedIndex >= 0 && initialSelectedIndex < commands.length) {
      return initialSelectedIndex;
    }
    return 0;
  });

  useEffect(() => {
    if (initialSelectedIndex !== undefined && initialSelectedIndex >= 0 && initialSelectedIndex < commands.length) {
      setSelectedIndex(initialSelectedIndex);
    }
  }, [initialSelectedIndex, commands.length]);

  useEffect(() => {
    if (commands.length === 0) {
      setSelectedIndex(0);
    } else if (selectedIndex >= commands.length) {
      setSelectedIndex(Math.max(0, commands.length - 1));
    }
  }, [commands.length, selectedIndex]);

  return {
    selectedIndex,
    setSelectedIndex,
  };
};
