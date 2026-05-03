import { Text } from "@nuvin/ink";
import React, { forwardRef, useState } from "react";
import Clickable from "./Clickable.js";
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
const Button = forwardRef<import("@nuvin/ink").BoxRef, React.PropsWithChildren<ButtonProps>>(
  (
    {
      children,
      variant = "filled",
      color,
      surface,
      focused = false,
      onClick,
      onHover,
      isMouseActive,
      ...boxProps
    },
    ref,
  ) => {
    const [hovered, setHovered] = useState(false);
    const active = focused || hovered;

    const handleHover = (h: boolean) => {
      setHovered(h);
      onHover?.(h);
    };

    if (variant === "text") {
      return (
        <Clickable
          ref={ref}
          onClick={onClick}
          onHover={handleHover}
          isMouseActive={isMouseActive}
          {...boxProps}
        >
          <Text bold={active} color={active ? color : surface}>
            {active ? "› " : "  "}
          </Text>
          <Text bold={active} color={color}>
            {children}
          </Text>
        </Clickable>
      );
    }

    if (variant === "outlined") {
      return (
        <Clickable
          ref={ref}
          onClick={onClick}
          onHover={handleHover}
          isMouseActive={isMouseActive}
          {...boxProps}
        >
          <Text
            bold={active}
            color={hovered ? surface : color}
            backgroundColor={hovered ? color : undefined}
          >
            {"["}
          </Text>
          <Text
            bold={active}
            color={hovered ? surface : color}
            backgroundColor={hovered ? color : undefined}
          >
            {" "}
          </Text>
          <Text
            bold
            color={hovered ? surface : color}
            backgroundColor={hovered ? color : undefined}
          >
            {children}
          </Text>
          <Text
            bold={active}
            color={hovered ? surface : color}
            backgroundColor={hovered ? color : undefined}
          >
            {" "}
          </Text>
          <Text
            bold={active}
            color={hovered ? surface : color}
            backgroundColor={hovered ? color : undefined}
          >
            {"]"}
          </Text>
        </Clickable>
      );
    }

    // Filled variant
    return (
      <Clickable
        ref={ref}
        onClick={onClick}
        onHover={handleHover}
        isMouseActive={isMouseActive}
        {...boxProps}
      >
        <Text
          bold={active}
          color={hovered ? color : surface}
          backgroundColor={hovered ? surface : color}
        >
          {" "}
        </Text>
        <Text bold color={hovered ? color : surface} backgroundColor={hovered ? surface : color}>
          {children}
        </Text>
        <Text
          bold={active}
          color={hovered ? color : surface}
          backgroundColor={hovered ? surface : color}
        >
          {" "}
        </Text>
      </Clickable>
    );
  },
);

Button.displayName = "Button";

export default Button;
export type { ButtonProps, ButtonVariant };
