import { describe, expect, it } from "vitest";

import {
  ConfigManager,
  discoverAgentDefinitionsFromDirectories,
  loadAgentDefinitionFromReference,
  loadAgentDefinitionsFromDirectories,
  resolveAgentDirectories,
  resolveConfigDirName,
} from "./index.js";

describe("@nuvin/config exports", () => {
  it("exports ConfigManager and agent loading helpers", () => {
    expect(typeof ConfigManager).toBe("function");
    expect(typeof resolveConfigDirName).toBe("function");
    expect(typeof resolveAgentDirectories).toBe("function");
    expect(typeof discoverAgentDefinitionsFromDirectories).toBe("function");
    expect(typeof loadAgentDefinitionFromReference).toBe("function");
    expect(typeof loadAgentDefinitionsFromDirectories).toBe("function");
  });
});
