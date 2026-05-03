import { type BoxProps, type BoxRef } from "@nuvin/ink";
import React from "react";
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
type ClickableComponent = React.ForwardRefExoticComponent<React.PropsWithChildren<ClickableProps> & React.RefAttributes<BoxRef>>;
declare const Clickable: ClickableComponent;
export default Clickable;
export type { ClickableProps, ClickEvent };
//# sourceMappingURL=Clickable.d.ts.map