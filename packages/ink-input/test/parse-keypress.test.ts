import { afterEach, describe, expect, it } from "vitest";
import { isKittyProtocolEnabled, setKittyProtocolEnabled } from "../src/index.js";
import { parseKeypress, splitInputChunks } from "../src/parseKeypress.js";

describe("parseKeypress", () => {
  afterEach(() => {
    setKittyProtocolEnabled(false);
  });

  it("parses home, end, delete, and backspace distinctly", () => {
    expect(parseKeypress("\x1b[H").key.home).toBe(true);
    expect(parseKeypress("\x1b[F").key.end).toBe(true);
    expect(parseKeypress("\x1b[3~").key.delete).toBe(true);
    expect(parseKeypress("\x7f").key.backspace).toBe(true);
  });

  it("parses kitty CSI-u sequences when enabled", () => {
    setKittyProtocolEnabled(true);

    const shiftEnter = parseKeypress("\x1b[13;2u");
    const heldBackspace = parseKeypress("\x1b[127;1:2u");

    expect(shiftEnter.input).toBe("\n");
    expect(heldBackspace.key.backspace).toBe(true);
    expect(isKittyProtocolEnabled()).toBe(true);
  });

  it("passes through bracketed paste markers", () => {
    expect(parseKeypress("\x1b[200~hello").input).toBe("\x1b[200~hello");
    expect(parseKeypress("\x1b[201~").input).toBe("\x1b[201~");
  });
});

describe("splitInputChunks", () => {
  it("splits held deletes and keeps IME replacement chunks atomic", () => {
    expect(splitInputChunks("\x7f\x7f\x7f")).toEqual(["\x7f", "\x7f", "\x7f"]);
    expect(splitInputChunks("\x7f\u0103")).toEqual(["\x7f\u0103"]);
  });

  it("splits mixed plain text and escape sequences", () => {
    expect(splitInputChunks("ab\x1b[DZ")).toEqual(["a", "b", "\x1b[D", "Z"]);
  });
});
