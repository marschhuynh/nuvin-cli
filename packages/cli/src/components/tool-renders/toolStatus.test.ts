import { describe, expect, it } from "vitest";

import { jsonObject, numberProp, stringProp } from "#src/components/tool-renders/json.js";
import { getToolStatusColor } from "#src/components/tool-renders/toolStatus.js";
import { getTheme } from "#src/lib/theme/store.js";

describe("tool render helpers", () => {
  it("narrows JSON object properties without formatting tool labels", () => {
    const input = jsonObject({
      command: "pnpm test",
      timeoutMs: 120000,
    });

    expect(stringProp(input, "command")).toBe("pnpm test");
    expect(numberProp(input, "timeoutMs")).toBe(120000);
    expect(jsonObject(["not", "object"])).toBeUndefined();
  });

  it("returns the status color from the active theme", () => {
    const theme = getTheme();

    expect(getToolStatusColor(theme, "ok")).toBe(theme.message.tool.ok);
  });
});
