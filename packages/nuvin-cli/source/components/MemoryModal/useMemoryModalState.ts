import { useState, useEffect } from 'react';
import type { MemoryEntry } from '@nuvin/nuvin-core';

interface UseMemoryModalStateResult {
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  memories: MemoryEntry[];
  setMemories: (memories: MemoryEntry[]) => void;
}

export function useMemoryModalState(
  initialMemories: MemoryEntry[],
  initialSelectedIndex?: number,
): UseMemoryModalStateResult {
  const [selectedIndex, setSelectedIndex] = useState(initialSelectedIndex ?? 0);
  const [memories, setMemories] = useState<MemoryEntry[]>(initialMemories);

  useEffect(() => {
    setMemories(initialMemories);
  }, [initialMemories]);

  useEffect(() => {
    if (initialSelectedIndex !== undefined) {
      setSelectedIndex(initialSelectedIndex);
    }
  }, [initialSelectedIndex]);

  return {
    selectedIndex,
    setSelectedIndex,
    memories,
    setMemories,
  };
}
