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
import type React from "react";
import type { InputMiddleware } from "./types.js";
type InputSetupProps = {
    children: React.ReactNode;
    middleware?: InputMiddleware[];
    enableKittyProtocol?: boolean | "auto";
    onCtrlC?: () => void;
    onPaste?: () => void;
};
export declare function InputSetup({ children, middleware: customMiddleware, enableKittyProtocol, onCtrlC, onPaste, }: InputSetupProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=InputSetup.d.ts.map