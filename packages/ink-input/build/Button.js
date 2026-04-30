import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Text } from "@nuvin/ink";
import { forwardRef, useState } from "react";
import Clickable from "./Clickable.js";
/**
A styled button component with click and hover support.

Renders in three variants:
- **filled**: colored background with contrasting text
- **outlined**: colored bracket borders `[label]` with colored text
- **text**: plain text with `›` prefix when focused/hovered

Filled and outlined invert on hover. Text variant shows `› label` when active.
*/
const Button = forwardRef(({ children, variant = "filled", color, surface, focused = false, onClick, onHover, isMouseActive, ...boxProps }, ref) => {
    const [hovered, setHovered] = useState(false);
    const active = focused || hovered;
    const handleHover = (h) => {
        setHovered(h);
        onHover?.(h);
    };
    if (variant === "text") {
        return (_jsxs(Clickable, { ref: ref, onClick: onClick, onHover: handleHover, isMouseActive: isMouseActive, ...boxProps, children: [_jsx(Text, { bold: active, color: active ? color : surface, children: active ? "› " : "  " }), _jsx(Text, { bold: active, color: color, children: children })] }));
    }
    if (variant === "outlined") {
        return (_jsxs(Clickable, { ref: ref, onClick: onClick, onHover: handleHover, isMouseActive: isMouseActive, ...boxProps, children: [_jsx(Text, { bold: active, color: hovered ? surface : color, backgroundColor: hovered ? color : undefined, children: "[" }), _jsx(Text, { bold: active, color: hovered ? surface : color, backgroundColor: hovered ? color : undefined, children: " " }), _jsx(Text, { bold: true, color: hovered ? surface : color, backgroundColor: hovered ? color : undefined, children: children }), _jsx(Text, { bold: active, color: hovered ? surface : color, backgroundColor: hovered ? color : undefined, children: " " }), _jsx(Text, { bold: active, color: hovered ? surface : color, backgroundColor: hovered ? color : undefined, children: "]" })] }));
    }
    // Filled variant
    return (_jsxs(Clickable, { ref: ref, onClick: onClick, onHover: handleHover, isMouseActive: isMouseActive, ...boxProps, children: [_jsx(Text, { bold: active, color: hovered ? color : surface, backgroundColor: hovered ? surface : color, children: " " }), _jsx(Text, { bold: true, color: hovered ? color : surface, backgroundColor: hovered ? surface : color, children: children }), _jsx(Text, { bold: active, color: hovered ? color : surface, backgroundColor: hovered ? surface : color, children: " " })] }));
});
Button.displayName = "Button";
export default Button;
//# sourceMappingURL=Button.js.map