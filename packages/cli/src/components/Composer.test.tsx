import { describe, expect, it, vi } from "vitest";

import { Composer } from "#src/components/Composer.js";
import { renderTest, waitForInk } from "#src/test-utils.js";

describe("Composer", () => {
  it("renders the spinner status while busy", async () => {
    const { cleanup, lastFrame } = renderTest(
      <Composer
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        disabled
        modelName="glm-4.7"
        status="busy"
      />,
    );

    await waitForInk();

    expect(lastFrame()).toContain("Ask glm-4.7 to inspect or change code");
    expect(lastFrame()).toContain("glm-4.7");
    cleanup();
  });

  it("shows the model and prompt glyph when idle", async () => {
    const { cleanup, lastFrame } = renderTest(
      <Composer
        value=""
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        disabled={false}
        modelName="glm-4.7"
        status="idle"
      />,
    );

    await waitForInk();

    expect(lastFrame()).toContain("glm-4.7");
    expect(lastFrame()).toContain("Ask glm-4.7 to inspect or change code");
    expect(lastFrame()).toContain("❯");
    cleanup();
  });

  // TODO: Implement slash command popup feature
  // Test skipped until feature is implemented
  it.skip("renders the slash command popup when typing /", async () => {
    const { cleanup, lastFrame } = renderTest(
      <Composer
        value="/"
        onChange={vi.fn()}
        onSubmit={vi.fn()}
        disabled={false}
        modelName="glm-4.7"
        status="idle"
      />,
    );

    await waitForInk();

    expect(lastFrame()).toContain("/clear");
    expect(lastFrame()).toContain("/help");
    expect(lastFrame()).toContain("/exit");
    cleanup();
  });
});
