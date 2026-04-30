import { useCallback, useRef } from "react";
import { useMouse } from "./useMouse.js";
/**
Hook that subscribes to mouse events within a specific component region.

Maps absolute terminal coordinates to component-relative coordinates
and only fires the handler when the event falls within the component's bounds.

Uses BoxRef.getBounds() to compute absolute position at event time,
so it stays accurate across scrolls and re-renders.
*/
export const useMouseRegion = (handler, options) => {
    const handlerRef = useRef(handler);
    handlerRef.current = handler;
    const wrappedHandler = useCallback((event) => {
        const element = options.ref.current;
        if (!element)
            return;
        const bounds = element.getBounds();
        if (bounds.width <= 0 || bounds.height <= 0)
            return;
        const relativeX = event.x - bounds.x - 1; // mouse coords are 1-based
        const relativeY = event.y - bounds.y - 1;
        // Check if event is within bounds
        if (relativeX < 0 || relativeX >= bounds.width)
            return;
        if (relativeY < 0 || relativeY >= bounds.height)
            return;
        return handlerRef.current({
            ...event,
            relativeX,
            relativeY,
        });
    }, [options.ref]);
    useMouse(wrappedHandler, { isActive: options.isActive, priority: options.priority });
};
//# sourceMappingURL=useMouseRegion.js.map