import { describe, expect, it, vi } from "vitest";
import {
  defaultMiddleware,
  focusStore,
  inputStore,
  resetFocusStore,
  resetInputStore,
  setMiddleware,
  setMiddlewareCallbacks,
} from "../src/index.js";

describe("focusStore", () => {
  it("cycles in tab order", () => {
    resetFocusStore();

    const unregisterB = focusStore.getState().registerFocusable("b", 1);
    const unregisterA = focusStore.getState().registerFocusable("a", 0);

    focusStore.getState().cycleFocus("forward");
    expect(focusStore.getState().focusedId).toBe("a");

    focusStore.getState().cycleFocus("forward");
    expect(focusStore.getState().focusedId).toBe("b");

    unregisterA();
    unregisterB();
  });
});

describe("inputStore", () => {
  it("enables mouse mode when stdout is initialized after a mouse subscriber mounts", () => {
    resetInputStore();
    const stdout = {
      write: vi.fn(),
    } as unknown as NodeJS.WriteStream;

    const unsubscribe = inputStore.getState().subscribeMouse(() => true);
    inputStore.getState().enableMouseMode();
    inputStore.getState().init(stdout);

    expect(stdout.write).toHaveBeenCalledWith("\x1b[?1000h\x1b[?1002h\x1b[?1003h\x1b[?1006h");
    expect(inputStore.getState().isMouseModeEnabled).toBe(true);

    unsubscribe();
  });

  it("dispatches to higher priority subscribers first and stops on true", () => {
    resetInputStore();
    const calls: string[] = [];

    const unsubLow = inputStore.getState().subscribe(
      () => {
        calls.push("low");
      },
      { priority: 1 },
    );

    const unsubHigh = inputStore.getState().subscribe(
      () => {
        calls.push("high");
        return true;
      },
      { priority: 10 },
    );

    inputStore.getState().handleInput("x");

    expect(calls).toEqual(["high"]);

    unsubLow();
    unsubHigh();
  });

  it("runs default middleware callbacks for ctrl-c and focus cycling", () => {
    resetInputStore();

    const onCtrlC = vi.fn();
    const onFocusCycle = vi.fn();
    setMiddleware(defaultMiddleware);
    setMiddlewareCallbacks({ onCtrlC, onFocusCycle });

    inputStore.getState().handleInput("\u0003");
    inputStore.getState().handleInput("\t");
    inputStore.getState().handleInput("\x1b[Z");

    expect(onCtrlC).toHaveBeenCalledTimes(1);
    expect(onFocusCycle).toHaveBeenNthCalledWith(1, "forward");
    expect(onFocusCycle).toHaveBeenNthCalledWith(2, "backward");
  });
});
