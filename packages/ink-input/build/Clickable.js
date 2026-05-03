import { jsx as _jsx } from "react/jsx-runtime";
import { Box } from "@nuvin/ink";
import { forwardRef, useCallback, useRef, useState } from "react";
import { useMouse } from "./useMouse.js";
const Clickable = forwardRef(({ children, onClick, onHover, isMouseActive = true, ...boxProps }, ref) => {
    const boxRef = useRef(null);
    const [isHovered, setIsHovered] = useState(false);
    // Merge external ref with internal ref
    const setRef = useCallback((el) => {
        boxRef.current = el;
        if (typeof ref === "function") {
            ref(el);
        }
        else if (ref) {
            ref.current = el;
        }
    }, [ref]);
    const hitTest = useCallback((event) => {
        const el = boxRef.current;
        if (!el)
            return false;
        const bounds = el.getBounds();
        if (bounds.width <= 0 || bounds.height <= 0)
            return false;
        const relX = event.x - bounds.x - 1;
        const relY = event.y - bounds.y - 1;
        return relX >= 0 && relX < bounds.width && relY >= 0 && relY < bounds.height;
    }, []);
    useMouse((event) => {
        // Hover tracking
        if (event.type === "move") {
            const hit = hitTest(event);
            if (hit && !isHovered) {
                setIsHovered(true);
                onHover?.(true);
            }
            else if (!hit && isHovered) {
                setIsHovered(false);
                onHover?.(false);
            }
            return hit;
        }
        // Clear hover on release
        if (event.type === "release") {
            if (isHovered) {
                setIsHovered(false);
                onHover?.(false);
            }
            return false;
        }
        // Click handling
        if (event.type === "click") {
            if (hitTest(event)) {
                onClick?.({ button: event.button, x: event.x, y: event.y });
                return true;
            }
        }
        return false;
    }, { isActive: isMouseActive && (!!onClick || !!onHover) });
    return (_jsx(Box, { ref: setRef, ...boxProps, children: children }));
});
Clickable.displayName = "Clickable";
export default Clickable;
//# sourceMappingURL=Clickable.js.map