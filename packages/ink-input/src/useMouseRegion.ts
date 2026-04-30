import type { BoxRef } from "@nuvin/ink";
import { useCallback, useRef } from "react";
import { useMouse } from "./useMouse.js";
import type { MouseEvent, UseMouseOptions } from "./types.js";

type RegionMouseEvent = MouseEvent & {
  /** X position relative to the region's left edge (0-based). */
  relativeX: number;
  /** Y position relative to the region's top edge (0-based). */
  relativeY: number;
};

type RegionMouseHandler = (event: RegionMouseEvent) => void | boolean;

type UseMouseRegionOptions = UseMouseOptions & {
  /** The Box ref for the region to track. */
  ref: React.RefObject<BoxRef | null>;
};

/**
Hook that subscribes to mouse events within a specific component region.

Maps absolute terminal coordinates to component-relative coordinates
and only fires the handler when the event falls within the component's bounds.

Uses BoxRef.getBounds() to compute absolute position at event time,
so it stays accurate across scrolls and re-renders.
*/
export const useMouseRegion = (
  handler: RegionMouseHandler,
  options: UseMouseRegionOptions,
) => {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  const wrappedHandler = useCallback(
    (event: MouseEvent) => {
      const element = options.ref.current;
      if (!element) return;

      const bounds = element.getBounds();
      if (bounds.width <= 0 || bounds.height <= 0) return;

      const relativeX = event.x - bounds.x - 1; // mouse coords are 1-based
      const relativeY = event.y - bounds.y - 1;

      // Check if event is within bounds
      if (relativeX < 0 || relativeX >= bounds.width) return;
      if (relativeY < 0 || relativeY >= bounds.height) return;

      return handlerRef.current({
        ...event,
        relativeX,
        relativeY,
      });
    },
    [options.ref],
  );

  useMouse(wrappedHandler, { isActive: options.isActive, priority: options.priority });
};

export type { RegionMouseEvent, RegionMouseHandler, UseMouseRegionOptions };
