import { Box, useWindowSize } from "@nuvin/ink";
import type React from "react";

import { useFullTheme } from "#src/lib/theme/store.js";

export type ModalProps = {
  /** Whether the modal is mounted/visible. */
  open: boolean;
  /** Modal body. The body owns its own input handling. */
  children?: React.ReactNode;
  /** Modal box background. Defaults to `theme.surfaces.modalSurface`. */
  backgroundColor?: string;
  /** Inner padding on the modal box. Defaults to 1. */
  padding?: number;
  /** Optional fixed width. If omitted, the modal sizes to its content (clamped to maxWidth). */
  width?: number | `${number}%`;
  /** Maximum modal width. Defaults to min(terminal cols - 4, 100). */
  maxWidth?: number;
  /** Maximum modal height. Defaults to terminal rows - 4. */
  maxHeight?: number;
};

/**
 * Generic modal box.
 *
 * Renders an opaque, padded surface with no border. Visual separation comes
 * from the background color contrast against the dimmed UI behind it
 * (the app toggles a global dim theme variant while a modal is open, see
 * `setThemeDimmed` in themeStore).
 *
 * Layered as an absolutely-positioned overlay that fills its nearest
 * `position="relative"` ancestor and centers the inner box. The page layout
 * (header, message list, composer, footer) is therefore preserved in the
 * background — no slot swap, no layout shift.
 */
export function Modal({
  open,
  children,
  backgroundColor,
  padding = 1,
  width,
  maxWidth,
  maxHeight,
}: ModalProps) {
  const theme = useFullTheme();
  const { columns, rows } = useWindowSize();

  if (!open) return null;

  const resolvedSurface = backgroundColor ?? theme.surfaces.modalSurface;
  const resolvedMaxWidth = maxWidth ?? Math.min(Math.max(20, columns - 4), 100);
  const resolvedMaxHeight = maxHeight ?? Math.max(8, rows - 4);

  return (
    <Box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      <Box
        flexDirection="column"
        backgroundColor={resolvedSurface}
        padding={padding}
        width={width}
        maxWidth={resolvedMaxWidth}
        maxHeight={resolvedMaxHeight}
        overflow="hidden"
      >
        {children}
      </Box>
    </Box>
  );
}
