import { describe, expect, it } from "vitest";

import { markdownCache } from "#src/lib/markdown/cache.js";
import { markdownProvider } from "#src/lib/markdown/provider.js";
import { renderedMarkdownLineCount, renderMarkdownToText } from "#src/lib/markdown/render.js";
import { resolveThemeRuntime } from "#src/lib/theme/runtime.js";

const theme = resolveThemeRuntime({
  backgrounds: "on",
  colorLevel: "truecolor",
  env: {} as NodeJS.ProcessEnv,
  mode: "dark",
}).theme;

describe("markdown rendering", () => {
  it("renders headings, emphasis, lists, and code fences to terminal text", () => {
    const output = renderMarkdownToText("# Title\n\n- **one**\n\n```ts\nconst x = 1;\n```", {
      reflowText: false,
      theme,
      width: 80,
    });

    expect(output).toContain("# Title");
    expect(output).toContain("one");
    expect(output).toContain("const x = 1;");
  });

  it("renders plain markdown as plain text", () => {
    const output = renderMarkdownToText("plain", {
      reflowText: false,
      theme,
      width: 80,
    });

    expect(output).toBe("plain");
  });

  it("counts rendered markdown lines", () => {
    expect(
      renderedMarkdownLineCount("# Title\n\n- one", {
        reflowText: false,
        theme,
        width: 80,
      }),
    ).toBeGreaterThanOrEqual(2);
  });

  it("reuses renderer instances when scrolling between multiple markdown widths", () => {
    const width61First = markdownProvider.getRenderer({
      reflowText: false,
      tokens: theme.tokens,
      width: 61,
    });
    const width62 = markdownProvider.getRenderer({
      reflowText: false,
      tokens: theme.tokens,
      width: 62,
    });
    const width61Second = markdownProvider.getRenderer({
      reflowText: false,
      tokens: theme.tokens,
      width: 61,
    });

    expect(width61Second).toBe(width61First);
    expect(width62).not.toBe(width61First);
  });

  it("keeps a practical scrollback-sized markdown render cache", () => {
    markdownCache.clear();

    for (let index = 0; index < 150; index++) {
      renderMarkdownToText(`## Heading ${index}\n\n- item ${index}`, {
        reflowText: false,
        theme,
        width: 80,
      });
    }

    expect(markdownCache.size()).toBe(150);
  });
});
