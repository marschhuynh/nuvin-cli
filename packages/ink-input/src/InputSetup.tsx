/**
 * InputSetup — Thin React component that bridges Ink's stdin to the input store.
 *
 * Responsibilities:
 * - Enables raw mode via Ink's useStdin
 * - Enables Kitty keyboard protocol if supported
 * - Listens to internal_eventEmitter for input data
 * - Routes all input through inputStore.handleInput()
 * - Cleans up on unmount (raw mode, Kitty protocol, mouse mode, timers)
 *
 * This is the ONLY file in the input system that imports from Ink hooks.
 */

import type { EventEmitter } from "node:events";
import { useStdin, useStdout } from "@nuvin/ink";
import type React from "react";
import { useEffect, useRef } from "react";
import { focusStore } from "./focus.js";
import { inputStore, setMiddleware } from "./input.js";
import { defaultMiddleware, setMiddlewareCallbacks } from "./middleware.js";
import { setKittyProtocolEnabled } from "./parseKeypress.js";
import type { InputMiddleware } from "./types.js";

const KITTY_KEYBOARD_ENABLE = "\x1b[>1u";
const KITTY_KEYBOARD_DISABLE = "\x1b[<u";

function readEnv(name: string): string {
  return process.env[name] ?? "";
}

function supportsKittyProtocol(): boolean {
  const term = readEnv("TERM");
  const termProgram = readEnv("TERM_PROGRAM");

  if (term === "xterm-kitty" || readEnv("KITTY_WINDOW_ID").length > 0) {
    return true;
  }

  const supportedTerminals = ["kitty", "ghostty", "WezTerm", "foot", "rio"];

  if (supportedTerminals.some((t) => termProgram.toLowerCase().includes(t.toLowerCase()))) {
    return true;
  }

  for (const key of Object.keys(process.env)) {
    if (key.startsWith("KITTY_")) {
      return true;
    }
  }

  return false;
}

type InputSetupProps = {
  children: React.ReactNode;
  middleware?: InputMiddleware[];
  enableKittyProtocol?: boolean | "auto";
  onCtrlC?: () => void;
  onPaste?: () => void;
};

export function InputSetup({
  children,
  middleware: customMiddleware,
  enableKittyProtocol = "auto",
  onCtrlC,
  onPaste,
}: InputSetupProps) {
  const { setRawMode, isRawModeSupported, internal_eventEmitter } = useStdin() as ReturnType<
    typeof useStdin
  > & { internal_eventEmitter: EventEmitter };

  const { stdout } = useStdout();

  const rawModeEnabledRef = useRef(false);
  const kittyProtocolEnabledRef = useRef(false);

  // Initialize store with stdout
  useEffect(() => {
    inputStore.getState().init(stdout);
  }, [stdout]);

  // Set up middleware and callbacks
  useEffect(() => {
    const mw = customMiddleware ?? defaultMiddleware;
    setMiddleware(mw);
  }, [customMiddleware]);

  useEffect(() => {
    setMiddlewareCallbacks({
      onCtrlC,
      onPaste,
      onFocusCycle: (direction) => {
        focusStore.getState().cycleFocus(direction);
      },
    });
  }, [onCtrlC, onPaste]);

  // Enable raw mode
  useEffect(() => {
    if (isRawModeSupported && !rawModeEnabledRef.current) {
      setRawMode(true);
      rawModeEnabledRef.current = true;
    }

    return () => {
      if (rawModeEnabledRef.current) {
        setRawMode(false);
        rawModeEnabledRef.current = false;
      }
    };
  }, [isRawModeSupported, setRawMode]);

  // Enable Kitty keyboard protocol
  useEffect(() => {
    const shouldEnable =
      enableKittyProtocol === true || (enableKittyProtocol === "auto" && supportsKittyProtocol());

    if (shouldEnable && stdout && !kittyProtocolEnabledRef.current) {
      stdout.write(KITTY_KEYBOARD_ENABLE);
      kittyProtocolEnabledRef.current = true;
      setKittyProtocolEnabled(true);
    }

    return () => {
      if (kittyProtocolEnabledRef.current && stdout) {
        stdout.write(KITTY_KEYBOARD_DISABLE);
        kittyProtocolEnabledRef.current = false;
        setKittyProtocolEnabled(false);
      }
    };
  }, [enableKittyProtocol, stdout]);

  // Wire internal_eventEmitter to input store
  useEffect(() => {
    if (!internal_eventEmitter) return;

    const handleInput = (data: string) => {
      inputStore.getState().handleInput(data);
    };

    internal_eventEmitter.on("input", handleInput);

    return () => {
      inputStore.getState().cleanup();
      internal_eventEmitter.off("input", handleInput);
    };
  }, [internal_eventEmitter]);

  return <>{children}</>;
}
