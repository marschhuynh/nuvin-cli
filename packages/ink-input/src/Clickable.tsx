import { Box, type BoxProps, type BoxRef } from "@nuvin/ink";
import React, { forwardRef, useCallback, useRef, useState } from "react";
import { useMouse } from "./useMouse.js";
import type { MouseEvent } from "./types.js";

type ClickEvent = {
  /** Mouse button number (0=left, 1=middle, 2=right). */
  button: number;
  /** Absolute terminal column (1-based). */
  x: number;
  /** Absolute terminal row (1-based). */
  y: number;
};

type ClickableProps = BoxProps & {
  /** Called when the component is clicked. */
  onClick?: (event: ClickEvent) => void;
  /** Called when the mouse enters (true) or leaves (false) the component. */
  onHover?: (hovering: boolean) => void;
  /** Whether mouse interaction is active. When false, no mouse events are processed. */
  isMouseActive?: boolean;
};

/**
A drop-in replacement for `<Box>` with mouse click and hover support.

Renders a standard `<Box>` and subscribes to mouse events via `useMouse`.
Uses `BoxRef.getBounds()` for accurate hit testing against the rendered area.

@example
```tsx
<Clickable
  onClick={() => handleSubmit()}
  onHover={(h) => setHighlighted(h)}
  paddingX={1}
  backgroundColor={highlighted ? "green" : "black"}
>
  <Text>Submit</Text>
</Clickable>
```
*/
const Clickable = forwardRef<BoxRef, React.PropsWithChildren<ClickableProps>>(
  (
    {
      children,
      onClick,
      onHover,
      isMouseActive = true,
      ...boxProps
    },
    ref,
  ) => {
    const boxRef = useRef<BoxRef | null>(null);
    const [isHovered, setIsHovered] = useState(false);

    // Merge external ref with internal ref
    const setRef = useCallback(
      (el: BoxRef | null) => {
        boxRef.current = el;
        if (typeof ref === "function") {
          ref(el);
        } else if (ref) {
          (ref as React.MutableRefObject<BoxRef | null>).current = el;
        }
      },
      [ref],
    );

    const hitTest = useCallback(
      (event: MouseEvent): boolean => {
        const el = boxRef.current;
        if (!el) return false;
        const bounds = el.getBounds();
        if (bounds.width <= 0 || bounds.height <= 0) return false;
        const relX = event.x - bounds.x - 1;
        const relY = event.y - bounds.y - 1;
        return relX >= 0 && relX < bounds.width && relY >= 0 && relY < bounds.height;
      },
      [],
    );

    useMouse(
      (event) => {
        // Hover tracking
        if (event.type === "move") {
          const hit = hitTest(event);
          if (hit && !isHovered) {
            setIsHovered(true);
            onHover?.(true);
          } else if (!hit && isHovered) {
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
      },
      { isActive: isMouseActive && (!!onClick || !!onHover) },
    );

    return (
      <Box ref={setRef} {...boxProps}>
        {children}
      </Box>
    );
  },
);

Clickable.displayName = "Clickable";

export default Clickable;
export type { ClickableProps, ClickEvent };
