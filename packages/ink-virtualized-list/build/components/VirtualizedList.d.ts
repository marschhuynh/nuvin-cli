import { type BoxProps } from "@nuvin/ink";
import React, { type ReactNode } from "react";
type ScrollState = {
    scrollY: number;
    containerHeight: number;
    contentHeight: number;
    atTop: boolean;
    atBottom: boolean;
};
type VisibleRange = {
    startIndex: number;
    endIndex: number;
};
export type VirtualizedListProps<T> = {
    items: T[];
    renderItem: (item: T, index: number) => ReactNode;
    keyExtractor: (item: T, index: number) => string;
    estimateItemHeight?: (item: T, index: number) => number;
    overscan?: number;
    scrollStep?: number;
    autoFollow?: boolean;
    enableKeyboardScroll?: boolean;
    focusable?: boolean;
    autoFocus?: boolean;
    focusId?: string;
    onFocusChange?: (focused: boolean) => void;
    showScrollbar?: boolean;
    scrollbarColor?: string;
    scrollbarTrackColor?: string;
    onScroll?: (state: ScrollState) => void;
    onVisibleRangeChange?: (range: VisibleRange) => void;
} & Omit<BoxProps, "children" | "overflow" | "ref">;
export type VirtualizedListRef = {
    scrollToOffset: (offsetY: number) => void;
    scrollToIndex: (index: number, align?: "start" | "end" | "auto") => void;
    scrollToTop: () => void;
    scrollToBottom: () => void;
    getScrollState: () => ScrollState;
    /** For diagnostics/tests only. Returns sizes of internal caches. */
    __getDebugCacheSizes?: () => {
        heightCache: number;
        refSetters: number;
        itemRefs: number;
    };
};
declare const VirtualizedList: <T>(props: VirtualizedListProps<T> & React.RefAttributes<VirtualizedListRef>) => React.JSX.Element;
export default VirtualizedList;
//# sourceMappingURL=VirtualizedList.d.ts.map