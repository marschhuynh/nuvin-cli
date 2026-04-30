import { Fragment as _Fragment, jsx as _jsx } from "react/jsx-runtime";
import { useStdin, useStdout } from "@nuvin/ink";
import { useEffect, useRef } from "react";
import { focusStore } from "./focus.js";
import { inputStore, setMiddleware } from "./input.js";
import { defaultMiddleware, setMiddlewareCallbacks } from "./middleware.js";
import { setKittyProtocolEnabled } from "./parseKeypress.js";
const KITTY_KEYBOARD_ENABLE = "\x1b[>1u";
const KITTY_KEYBOARD_DISABLE = "\x1b[<u";
function readEnv(name) {
    return process.env[name] ?? "";
}
function supportsKittyProtocol() {
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
export function InputSetup({ children, middleware: customMiddleware, enableKittyProtocol = "auto", onCtrlC, onPaste, }) {
    const { setRawMode, isRawModeSupported, internal_eventEmitter } = useStdin();
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
        const shouldEnable = enableKittyProtocol === true || (enableKittyProtocol === "auto" && supportsKittyProtocol());
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
        if (!internal_eventEmitter)
            return;
        const handleInput = (data) => {
            inputStore.getState().handleInput(data);
        };
        internal_eventEmitter.on("input", handleInput);
        return () => {
            inputStore.getState().cleanup();
            internal_eventEmitter.off("input", handleInput);
        };
    }, [internal_eventEmitter]);
    return _jsx(_Fragment, { children: children });
}
//# sourceMappingURL=InputSetup.js.map