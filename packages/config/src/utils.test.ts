import { describe, expect, it } from "vitest";

import type { CLIConfig } from "./types.js";
import {
  createNestedPatch,
  deepMerge,
  deleteNestedValue,
  getNestedValue,
  resolveProviderToken,
} from "./utils.js";

describe("config utils", () => {
  it("deep merges unrelated object keys", () => {
    expect(
      deepMerge(
        { model: "a", ui: { theme: { mode: "dark" } } } as Record<string, unknown>,
        { ui: { theme: { backgrounds: "off" } } } as Record<string, unknown>,
      ),
    ).toEqual({ model: "a", ui: { theme: { mode: "dark", backgrounds: "off" } } });
  });

  it("merges arrays index-by-index", () => {
    expect(
      deepMerge(
        {
          rows: [
            ["model", "|"],
            ["gitBranch", "|"],
          ],
        } as Record<string, unknown>,
        { rows: [["model", "|", "tokens"]] } as Record<string, unknown>,
      ),
    ).toEqual({
      rows: [
        ["model", "|", "tokens"],
        ["gitBranch", "|"],
      ],
    });
  });

  it("reads nested values via dot paths", () => {
    expect(getNestedValue({ ui: { theme: { mode: "light" } } }, "ui.theme.mode")).toBe("light");
    expect(getNestedValue({ a: { b: [{ c: 9 }] } }, "a.b[0].c")).toBe(9);
    expect(getNestedValue({ a: 1 }, "a.b.c")).toBeUndefined();
  });

  it("creates nested patches with array notation", () => {
    expect(createNestedPatch("providers.openrouter.auth[0].apiKey", "sk-test")).toEqual({
      providers: { openrouter: { auth: [{ apiKey: "sk-test" }] } },
    });
  });

  it("deletes nested values without disturbing siblings", () => {
    const obj = { ui: { theme: { mode: "dark", backgrounds: "off" } } };
    deleteNestedValue(obj, "ui.theme.mode");
    expect(obj).toEqual({ ui: { theme: { backgrounds: "off" } } });
  });

  describe("resolveProviderToken", () => {
    it("prefers auth[] entry matching currentAuth", () => {
      const config: CLIConfig = {
        providers: {
          openrouter: {
            currentAuth: "apiKey",
            auth: [{ type: "apiKey", apiKey: "sk-current" }],
            token: "legacy-token",
          },
        },
      };
      expect(resolveProviderToken(config, "openrouter")).toBe("sk-current");
    });

    it("falls back to first apiKey auth entry when currentAuth is missing", () => {
      const config: CLIConfig = {
        providers: {
          openrouter: {
            auth: [{ type: "apiKey", apiKey: "sk-first" }],
          },
        },
      };
      expect(resolveProviderToken(config, "openrouter")).toBe("sk-first");
    });

    it("falls back to legacy token, then provider.apiKey, then top-level apiKey", () => {
      expect(resolveProviderToken({ providers: { p: { token: "t1" } } } as CLIConfig, "p")).toBe(
        "t1",
      );
      expect(resolveProviderToken({ providers: { p: { apiKey: "a1" } } } as CLIConfig, "p")).toBe(
        "a1",
      );
      expect(resolveProviderToken({ apiKey: "top" } as CLIConfig, "p")).toBe("top");
    });
  });
});
