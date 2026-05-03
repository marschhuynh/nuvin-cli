import { EventEmitter } from "node:events";
import type { RenderOptions } from "@nuvin/ink";
import { render as inkRender } from "@nuvin/ink";
import { InputSetup, resetFocusStore, resetInputStore } from "@nuvin/ink-input";
import type { ReactElement } from "react";

// Kitty keyboard protocol escape sequences that should be filtered from test output
// Format: ESC [ < or > followed by optional flags and u
// Examples: \u001b[>1u, \u001b[<u, \u001b[>0u
// See: https://sw.kovidgoyal.net/kitty/keyboard-protocol/
// Note: [><] is a character class matching either > or <
// biome-ignore lint/suspicious/noControlCharactersInRegex: ESC is intentional for terminal escape sequence matching
const KITTY_PROTOCOL_RESPONSE_PATTERN = /\x1b\[[><][0-9;]*u/g;

class MockStdout extends EventEmitter {
  readonly frames: string[] = [];
  private latestFrame?: string;
  readonly columns = 80;
  readonly rows = 24;

  write = (frame: string) => {
    this.frames.push(frame);
    this.latestFrame = frame;
    return true;
  };

  lastFrame() {
    if (!this.latestFrame) {
      return "";
    }

    // Filter out kitty keyboard protocol responses which are used for
    // terminal capability detection but aren't part of the actual UI
    const filtered = this.latestFrame.replace(KITTY_PROTOCOL_RESPONSE_PATTERN, "");

    // If filtering removed everything, return the last non-empty frame
    if (filtered === "" && this.frames.length > 1) {
      for (let i = this.frames.length - 2; i >= 0; i--) {
        const frame = this.frames[i];
        if (!frame) continue;

        const filteredFrame = frame.replace(KITTY_PROTOCOL_RESPONSE_PATTERN, "");
        if (filteredFrame && filteredFrame !== "") {
          return filteredFrame;
        }
      }
    }

    return filtered;
  }
}

class MockStdin extends EventEmitter {
  isTTY = true as const;
  private buffer: string[] = [];

  write = (data: string) => {
    this.buffer.push(data);
    this.emit("readable");
  };

  read = () => {
    return this.buffer.shift() ?? null;
  };

  setEncoding() {}
  setRawMode() {}
  resume() {}
  pause() {}
  ref() {}
  unref() {}
}

export function renderTest(tree: ReactElement) {
  resetInputStore();
  resetFocusStore();

  const stdout = new MockStdout();
  const stdin = new MockStdin();

  const instance = inkRender(<InputSetup>{tree}</InputSetup>, {
    stdout: stdout as unknown as RenderOptions["stdout"],
    stdin: stdin as unknown as RenderOptions["stdin"],
    stderr: new EventEmitter() as unknown as RenderOptions["stderr"],
    debug: true,
    exitOnCtrlC: false,
    patchConsole: false,
  });

  return {
    cleanup: instance.cleanup,
    lastFrame: () => stdout.lastFrame() ?? "",
    stdin,
    stdout,
    unmount: instance.unmount,
  };
}

export async function waitForInk() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}
