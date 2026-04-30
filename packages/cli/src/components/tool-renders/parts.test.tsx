import { Box } from "@nuvin/ink";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import {
  getToolPreviewCacheSizeForTest,
  previewLines,
} from "#src/components/tool-renders/format.js";
import {
  ToolArgsBlock,
  ToolHeaderLine,
  ToolResultPreview,
} from "#src/components/tool-renders/parts.js";
import { renderTest, waitForInk } from "#src/test-utils.js";

function renderPart(node: ReactNode) {
  return renderTest(
    <Box width={80} flexDirection="column">
      {node}
    </Box>,
  );
}

describe("tool render parts", () => {
  it("renders a public-style header line", async () => {
    const { cleanup, lastFrame } = renderPart(
      <ToolHeaderLine
        color="green"
        mainArg="pnpm test at /repo"
        phrase="Waiting to run command"
        status="pending"
      />,
    );

    await waitForInk();
    expect(lastFrame()).toContain("◌ Waiting to run command · pnpm test at /repo");
    cleanup();
  });

  it("renders argument rows without block decoration", async () => {
    const { cleanup, lastFrame } = renderPart(
      <ToolArgsBlock
        rows={[
          { label: "Pattern", value: "TODO" },
          { label: "Path", value: "src" },
        ]}
      />,
    );

    await waitForInk();
    const frame = lastFrame();
    expect(frame).toContain("Pattern: TODO");
    expect(frame).toContain("Path: src");
    expect(frame).not.toContain("│");
    cleanup();
  });

  it("renders a tailing result preview with a leading accent aligned after the tool icon", async () => {
    const { cleanup, lastFrame } = renderPart(
      <ToolResultPreview fromEnd={true} maxLines={2} text={"one\ntwo\nthree\nfour\n"} />,
    );

    await waitForInk();
    const frame = lastFrame();
    expect(frame).toContain("▌ ... 2 earlier lines");
    expect(frame).toContain("... 2 earlier lines");
    expect(frame).toContain("three");
    expect(frame).toContain("four");
    expect(frame).not.toContain("one");
    expect(frame).not.toContain("│");
    cleanup();
  });

  it("bounds cached tool result previews", async () => {
    for (let index = 0; index < 300; index++) {
      previewLines(`line ${index}\nline ${index + 1}\nline ${index + 2}`, 2, true);
    }

    expect(getToolPreviewCacheSizeForTest()).toBeLessThanOrEqual(32);
  });
});
