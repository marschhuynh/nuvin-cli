import type { BoxRef } from "@nuvin/ink";
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
export declare const useMouseRegion: (handler: RegionMouseHandler, options: UseMouseRegionOptions) => void;
export type { RegionMouseEvent, RegionMouseHandler, UseMouseRegionOptions };
//# sourceMappingURL=useMouseRegion.d.ts.map