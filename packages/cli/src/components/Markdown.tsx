import { Text } from "@nuvin/ink";
import { useMemo } from "react";

import { renderMarkdownToText } from "#src/lib/markdown/render.js";
import { useTheme } from "#src/lib/theme/store.js";

type MarkdownProps = {
  backgroundColor?: string;
  children: string;
  color?: string;
  disableMarkdown?: boolean;
  enableCache?: boolean;
  /**
   * The exact width (in terminal columns) available for rendered markdown
   * inside this component's parent. REQUIRED — the renderer cannot infer
   * it: marked-terminal wraps text/tables/HRs at this value during the
   * render pass (before Ink layout), so any mismatch with the actual
   * parent width produces visible wrap artefacts AND invalidates the
   * height estimator in MessageList.
   *
   * Callers MUST pass the same value used by the height estimator.
   */
  maxWidth: number;
  reflowText?: boolean;
};

export function Markdown({
  backgroundColor,
  children,
  color,
  disableMarkdown,
  enableCache = true,
  maxWidth,
  reflowText = false,
}: MarkdownProps) {
  const theme = useTheme();
  const width = Math.max(20, maxWidth);

  const renderedContent = useMemo(() => {
    if (disableMarkdown) {
      return children ?? "";
    }

    return renderMarkdownToText(children ?? "", {
      enableCache,
      reflowText,
      theme,
      width,
    });
  }, [children, disableMarkdown, enableCache, reflowText, theme, width]);

  return (
    <Text backgroundColor={backgroundColor} color={color} wrap="wrap">
      {renderedContent}
    </Text>
  );
}
