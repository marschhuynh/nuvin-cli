import { jsx as _jsx } from "react/jsx-runtime";
import { Box, Text } from "@nuvin/ink";
export function TextInputScrollbar({ scrollRatio, visibleRatio, height, color = "cyan", trackColor = "gray", }) {
    if (visibleRatio >= 1 || height <= 0) {
        return null;
    }
    const thumbHeight = Math.max(1, Math.round(visibleRatio * height));
    const maxThumbPos = height - thumbHeight;
    const thumbPosition = Math.round(scrollRatio * maxThumbPos);
    const track = [];
    for (let i = 0; i < height; i++) {
        if (i >= thumbPosition && i < thumbPosition + thumbHeight) {
            track.push("┃");
        }
        else {
            track.push("│");
        }
    }
    return (_jsx(Box, { flexDirection: "column", flexShrink: 0, marginLeft: 1, children: track.map((char, i) => (_jsx(Text, { color: char === "┃" ? color : trackColor, children: char }, `scrollbar-track-${i}`))) }));
}
//# sourceMappingURL=TextInputScrollbar.js.map