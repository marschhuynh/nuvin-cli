import { useMemo } from 'react';

export type VirtualizationOptions<T> = {
  items: T[];
  containerHeight: number;
  itemHeight: number | ((item: T, index: number) => number);
  scrollOffset?: number;
  overscan?: number;
};

export type VirtualizationResult<T> = {
  visibleItems: Array<{ item: T; index: number; offsetY: number }>;
  totalHeight: number;
  startIndex: number;
  endIndex: number;
};

export function useVirtualization<T>(options: VirtualizationOptions<T>): VirtualizationResult<T> {
  const { items, containerHeight, itemHeight, scrollOffset = 0, overscan = 2 } = options;

  return useMemo(() => {
    if (items.length === 0 || containerHeight <= 0) {
      return {
        visibleItems: [],
        totalHeight: 0,
        startIndex: 0,
        endIndex: 0,
      };
    }

    const getItemHeight = (item: T, index: number): number => {
      return typeof itemHeight === 'function' ? itemHeight(item, index) : itemHeight;
    };

    let totalHeight = 0;
    const itemOffsets: number[] = [];

    for (let i = 0; i < items.length; i++) {
      itemOffsets.push(totalHeight);
      totalHeight += getItemHeight(items[i], i);
    }

    let startIndex = 0;
    for (let i = 0; i < items.length; i++) {
      if (itemOffsets[i] + getItemHeight(items[i], i) > scrollOffset) {
        startIndex = i;
        break;
      }
    }

    let endIndex = startIndex;
    const viewportEnd = scrollOffset + containerHeight;
    for (let i = startIndex; i < items.length; i++) {
      endIndex = i;
      if (itemOffsets[i] >= viewportEnd) {
        break;
      }
    }

    startIndex = Math.max(0, startIndex - overscan);
    endIndex = Math.min(items.length - 1, endIndex + overscan);

    const visibleItems: Array<{ item: T; index: number; offsetY: number }> = [];
    for (let i = startIndex; i <= endIndex; i++) {
      visibleItems.push({
        item: items[i],
        index: i,
        offsetY: itemOffsets[i] - scrollOffset,
      });
    }

    return {
      visibleItems,
      totalHeight,
      startIndex,
      endIndex,
    };
  }, [items, containerHeight, itemHeight, scrollOffset, overscan]);
}
