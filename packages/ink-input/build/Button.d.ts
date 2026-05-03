import React from "react";
import type { ClickableProps } from "./Clickable.js";
type ButtonVariant = "filled" | "outlined" | "text";
type ButtonProps = Omit<ClickableProps, "children"> & {
    /** Button visual style. */
    variant?: ButtonVariant;
    /** Color for the button (hex string or chalk-compatible color). */
    color: string;
    /** Background color for the button surface (used for contrast). */
    surface?: string;
    /** Whether the button is focused (keyboard navigation). Renders bold. */
    focused?: boolean;
    /** Button label content. */
    children: React.ReactNode;
};
/**
A styled button component with click and hover support.

Renders in three variants:
- **filled**: colored background with contrasting text
- **outlined**: colored bracket borders `[label]` with colored text
- **text**: plain text with `›` prefix when focused/hovered

Filled and outlined invert on hover. Text variant shows `› label` when active.
*/
declare const Button: React.ForwardRefExoticComponent<Omit<ClickableProps, "children"> & {
    /** Button visual style. */
    variant?: ButtonVariant;
    /** Color for the button (hex string or chalk-compatible color). */
    color: string;
    /** Background color for the button surface (used for contrast). */
    surface?: string;
    /** Whether the button is focused (keyboard navigation). Renders bold. */
    focused?: boolean;
    /** Button label content. */
    children: React.ReactNode;
} & {
    children?: React.ReactNode | undefined;
} & React.RefAttributes<import("@nuvin/ink").BoxRef>>;
export default Button;
export type { ButtonProps, ButtonVariant };
//# sourceMappingURL=Button.d.ts.map