import { afterEach, describe, expect, it, vi } from "vitest";

import { StatusFooter } from "#src/components/StatusFooter.js";
import { renderTest, waitForInk } from "#src/test-utils.js";

const MEBIBYTE = 1024 * 1024;

function createMemoryUsage(rssMebibytes: number): NodeJS.MemoryUsage {
  return {
    arrayBuffers: 1 * MEBIBYTE,
    external: 3 * MEBIBYTE,
    heapTotal: 72 * MEBIBYTE,
    heapUsed: 48 * MEBIBYTE,
    rss: rssMebibytes * MEBIBYTE,
  };
}

describe("StatusFooter", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders app process memory usage alongside the footer hint", async () => {
    vi.spyOn(process, "memoryUsage").mockReturnValue(createMemoryUsage(128));

    const { cleanup, lastFrame } = renderTest(<StatusFooter />);

    await waitForInk();

    // Normalize whitespace to handle terminal line wrapping at 80 columns.
    const frame = lastFrame().replace(/\s+/g, " ");
    expect(frame).toContain("App 128.0 MB RSS");
    expect(frame).toContain("48.0");
    expect(frame).toContain("MB heap");
    expect(frame).toContain("/ commands");
    expect(frame).toContain("⇧drag=select");
    cleanup();
  });

  it("refreshes app process memory usage every second", async () => {
    vi.spyOn(process, "memoryUsage")
      .mockReturnValueOnce(createMemoryUsage(128))
      .mockReturnValue(createMemoryUsage(256));

    const { cleanup, lastFrame } = renderTest(<StatusFooter />);

    await waitForInk();
    expect(lastFrame()).toContain("App 128.0 MB RSS");

    await new Promise((resolve) => setTimeout(resolve, 1050));
    await waitForInk();
    expect(lastFrame()).toContain("App 256.0 MB RSS");
    cleanup();
  });
});
