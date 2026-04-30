import { Box } from "@nuvin/ink";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import {
  buildHunks,
  createDiffLineRenderModel,
  createSimpleDiff,
  type DiffLine,
  FileDiffView,
} from "#src/components/tool-renders/FileDiffView.js";
import { getTheme } from "#src/lib/theme/store.js";
import { renderTest, waitForInk } from "#src/test-utils.js";

function renderDiff(node: ReactNode) {
  return renderTest(
    <Box width={80} flexDirection="column">
      {node}
    </Box>,
  );
}

function requireDiffLine(line: DiffLine | undefined): DiffLine {
  if (!line) {
    throw new Error("Expected diff line to exist");
  }

  return line;
}

describe("FileDiffView", () => {
  it("renders identical content as no changes", async () => {
    const { cleanup, lastFrame } = renderDiff(
      <FileDiffView blocks={[{ search: "same", replace: "same" }]} />,
    );

    await waitForInk();
    expect(lastFrame()).toContain("(no changes)");
    cleanup();
  });

  it("renders a single-line replacement as remove and add lines", async () => {
    const { cleanup, lastFrame } = renderDiff(
      <FileDiffView
        blocks={[{ search: 'const value = "hello";', replace: 'const value = "world";' }]}
      />,
    );

    await waitForInk();
    const frame = lastFrame();
    expect(frame).toContain('1│ -const value = "hello";');
    expect(frame).toContain('1│ +const value = "world";');
    cleanup();
  });

  it("renders multi-line additions and removals", async () => {
    const { cleanup, lastFrame } = renderDiff(
      <FileDiffView
        blocks={[
          {
            search: 'function foo() {\n  console.log("old");\n}',
            replace: 'function foo() {\n  console.log("new");\n  console.log("added");\n}',
          },
        ]}
      />,
    );

    await waitForInk();
    const frame = lastFrame();
    expect(frame).toContain("1│  function foo() {");
    expect(frame).toContain('2│ -  console.log("old");');
    expect(frame).toContain('2│ +  console.log("new");');
    expect(frame).toContain('3│ +  console.log("added");');
    cleanup();
  });

  it("uses line number metadata", async () => {
    const { cleanup, lastFrame } = renderDiff(
      <FileDiffView
        blocks={[{ search: "old line", replace: "new line" }]}
        lineNumbers={{
          oldStartLine: 42,
          oldEndLine: 42,
          newStartLine: 42,
          newEndLine: 42,
          oldLineCount: 1,
          newLineCount: 1,
        }}
      />,
    );

    await waitForInk();
    const frame = lastFrame();
    expect(frame).toContain("42│ -old line");
    expect(frame).toContain("42│ +new line");
    cleanup();
  });

  it("highlights only the changed inline segment on modified lines", () => {
    const theme = getTheme();
    const lines = createSimpleDiff("Line 11: Monitoring", "Line 11: Monitoring & observability", {
      oldStartLine: 11,
      oldEndLine: 11,
      newStartLine: 11,
      newEndLine: 11,
      oldLineCount: 1,
      newLineCount: 1,
    });

    const removed = createDiffLineRenderModel(requireDiffLine(lines[0]), 2, 80, theme);
    const added = createDiffLineRenderModel(requireDiffLine(lines[1]), 2, 80, theme);

    expect(removed.gutterText).toBe("11│ ");
    expect(removed.bodyText).toBe("-Line 11: Monitoring");
    expect(removed.lineNumberColor).toBe(theme.diff.prefix.remove);
    expect(removed.bodySegments).toEqual([
      {
        background: theme.diff.background.remove,
        color: theme.diff.highlightText,
        text: "-",
      },
      {
        background: theme.diff.background.remove,
        color: theme.diff.highlightText,
        text: "Line 11: Monitoring",
      },
    ]);

    expect(added.gutterText).toBe("11│ ");
    expect(added.bodyText).toBe("+Line 11: Monitoring & observability");
    expect(added.lineNumberColor).toBe(theme.diff.prefix.add);
    expect(added.bodySegments).toEqual([
      {
        background: theme.diff.background.add,
        color: theme.diff.highlightText,
        text: "+",
      },
      {
        background: theme.diff.background.add,
        color: theme.diff.highlightText,
        text: "Line 11: Monitoring",
      },
      {
        background: theme.diff.background.addHighlight,
        color: theme.diff.highlightText,
        text: " & observability",
      },
    ]);
  });

  it("pairs similar remove and add lines inside replacement blocks", () => {
    const theme = getTheme();
    const lines = createSimpleDiff(
      "    port: 8080\n    timeout: 30\n    debug: false",
      "    port: 9000\n    timeout: 60\n    debug: true",
      {
        oldStartLine: 20,
        oldEndLine: 22,
        newStartLine: 20,
        newEndLine: 22,
        oldLineCount: 3,
        newLineCount: 3,
      },
    );

    const removedPort = createDiffLineRenderModel(requireDiffLine(lines[0]), 2, 80, theme);
    const removedTimeout = createDiffLineRenderModel(requireDiffLine(lines[1]), 2, 80, theme);
    const removedDebug = createDiffLineRenderModel(requireDiffLine(lines[2]), 2, 80, theme);
    const addedPort = createDiffLineRenderModel(requireDiffLine(lines[3]), 2, 80, theme);
    const addedTimeout = createDiffLineRenderModel(requireDiffLine(lines[4]), 2, 80, theme);
    const addedDebug = createDiffLineRenderModel(requireDiffLine(lines[5]), 2, 80, theme);

    expect(removedPort.bodySegments.at(-1)).toEqual({
      background: theme.diff.background.removeHighlight,
      color: theme.diff.highlightText,
      text: "8080",
    });
    expect(removedTimeout.bodySegments.at(-1)).toEqual({
      background: theme.diff.background.removeHighlight,
      color: theme.diff.highlightText,
      text: "30",
    });
    expect(removedDebug.bodySegments.at(-1)).toEqual({
      background: theme.diff.background.removeHighlight,
      color: theme.diff.highlightText,
      text: "false",
    });
    expect(addedPort.bodySegments.at(-1)).toEqual({
      background: theme.diff.background.addHighlight,
      color: theme.diff.highlightText,
      text: "9000",
    });
    expect(addedTimeout.bodySegments.at(-1)).toEqual({
      background: theme.diff.background.addHighlight,
      color: theme.diff.highlightText,
      text: "60",
    });
    expect(addedDebug.bodySegments.at(-1)).toEqual({
      background: theme.diff.background.addHighlight,
      color: theme.diff.highlightText,
      text: "true",
    });
  });

  it("does not inline-highlight unrelated large rewrites", () => {
    const theme = getTheme();
    const oldBlock = [
      '    """Calculate discount based on customer type and price."""',
      '    if customer_type == "premium":',
      "        return price * 0.20",
      '    elif customer_type == "regular":',
      "        return price * 0.10",
      '    elif customer_type == "new":',
      "        return price * 0.05",
      "    else:",
      "        return 0.0",
    ].join("\n");
    const newBlock = [
      '    """',
      "    Calculate discount based on customer type and price.",
      "",
      "    Args:",
      "        price: The base price before discount",
      "        customer_type: Type of customer ('premium', 'regular', 'new', 'vip')",
      "",
      "    Returns:",
      "        Discount amount to be subtracted from the price",
      "",
      "    Raises:",
      "        ValueError: If price is negative or customer_type is invalid",
      '    """',
      "    if price < 0:",
      '        raise ValueError("Price cannot be negative")',
      "",
      "    discount_rates = {",
      '        "vip": 0.25,',
      '        "premium": 0.20,',
      '        "regular": 0.10,',
      '        "new": 0.05,',
      '        "guest": 0.0',
      "    }",
    ].join("\n");

    const renderedLines = createSimpleDiff(oldBlock, newBlock).map((line) =>
      createDiffLineRenderModel(line, 2, 120, theme),
    );

    expect(
      renderedLines.some((line) =>
        line.bodySegments.some(
          (segment) =>
            segment.background === theme.diff.background.addHighlight ||
            segment.background === theme.diff.background.removeHighlight,
        ),
      ),
    ).toBe(false);
  });

  describe("buildHunks", () => {
    it("returns no hunks when there are no changes", () => {
      const diff = createSimpleDiff("a\nb\nc", "a\nb\nc");
      expect(buildHunks(diff)).toEqual([]);
    });

    it("includes ±3 context lines around a single change", () => {
      const oldText = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"].join("\n");
      const newText = ["a", "b", "c", "d", "E", "f", "g", "h", "i", "j"].join("\n");
      const diff = createSimpleDiff(oldText, newText);
      const hunks = buildHunks(diff);

      expect(hunks).toHaveLength(1);
      const [hunk] = hunks;
      if (!hunk) throw new Error("expected one hunk");
      expect(hunk.hiddenBefore).toBe(1); // line "a" hidden
      // diff = [a,b,c,d,-e,+E,f,g,h,i,j]; ±3 context around remove(idx 4) and add(idx 5)
      // merged range = indices 1..8 = b,c,d,-e,+E,f,g,h (8 lines)
      expect(hunk.lines).toHaveLength(8);
      expect(hunk.lines[0]?.content).toBe("b");
      expect(hunk.lines.at(-1)?.content).toBe("h");
    });

    it("merges adjacent change regions whose context windows overlap", () => {
      // Changes at indices 3 and 8 (gap of 4 lines, less than 2*context=6) → merged
      const oldText = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"].join("\n");
      const newText = ["a", "b", "c", "D", "e", "f", "g", "h", "I", "j", "k"].join("\n");
      const diff = createSimpleDiff(oldText, newText);
      const hunks = buildHunks(diff);

      expect(hunks).toHaveLength(1);
    });

    it("splits change regions whose context windows do not overlap", () => {
      // Changes far apart at indices 1 and 18 → two hunks
      const oldLines = Array.from({ length: 20 }, (_, i) => `line${i}`);
      const newLines = [...oldLines];
      newLines[1] = "LINE1";
      newLines[18] = "LINE18";
      const diff = createSimpleDiff(oldLines.join("\n"), newLines.join("\n"));
      const hunks = buildHunks(diff);

      expect(hunks).toHaveLength(2);
      const [first, second] = hunks;
      if (!first || !second) throw new Error("expected two hunks");
      expect(first.hiddenBefore).toBe(0);
      expect(second.hiddenBefore).toBeGreaterThan(0);
    });

    it("respects a custom context size", () => {
      const oldText = ["a", "b", "c", "d", "e", "f", "g"].join("\n");
      const newText = ["a", "b", "c", "D", "e", "f", "g"].join("\n");
      const diff = createSimpleDiff(oldText, newText);
      const hunks = buildHunks(diff, 1);

      expect(hunks).toHaveLength(1);
      const [hunk] = hunks;
      if (!hunk) throw new Error("expected one hunk");
      // 1 context + 1 remove + 1 add + 1 context = 4
      expect(hunk.lines).toHaveLength(4);
      expect(hunk.hiddenBefore).toBe(2);
    });
  });

  describe("LCS size cap", () => {
    it("falls back to raw remove/add when block dimensions exceed the cap", () => {
      // 600 × 600 = 360_000 > 250_000 cells → fallback
      const oldLines = Array.from({ length: 600 }, (_, i) => `old line ${i}`).join("\n");
      const newLines = Array.from({ length: 600 }, (_, i) => `new line ${i}`).join("\n");
      const diff = createSimpleDiff(oldLines, newLines);

      expect(diff).toHaveLength(1200);
      expect(diff.slice(0, 600).every((line) => line.type === "remove")).toBe(true);
      expect(diff.slice(600).every((line) => line.type === "add")).toBe(true);
      // No inline-highlight modify lines should be produced in fallback mode.
      expect(diff.some((line) => line.type === "modify")).toBe(false);
    });

    it("preserves line numbers in the fallback path", () => {
      const oldLines = Array.from({ length: 600 }, () => "x").join("\n");
      const newLines = Array.from({ length: 600 }, () => "y").join("\n");
      const diff = createSimpleDiff(oldLines, newLines, {
        oldStartLine: 100,
        oldEndLine: 699,
        newStartLine: 100,
        newEndLine: 699,
        oldLineCount: 600,
        newLineCount: 600,
      });

      expect(diff[0]?.oldLineNum).toBe(100);
      expect(diff[599]?.oldLineNum).toBe(699);
      expect(diff[600]?.newLineNum).toBe(100);
      expect(diff.at(-1)?.newLineNum).toBe(699);
    });
  });
});
