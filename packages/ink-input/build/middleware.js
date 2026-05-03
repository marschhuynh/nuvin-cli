let callbacks = {};
/** Configure middleware callbacks. Called once during InputSetup mount. */
export function setMiddlewareCallbacks(cb) {
    callbacks = cb;
}
export const ctrlCMiddleware = (input, key, next) => {
    if (key.ctrl && input === "c") {
        callbacks.onCtrlC?.();
    }
    next();
};
export const pasteDetectionMiddleware = (input, key, next) => {
    if (input.startsWith("\x1b[200~") || input.startsWith("[200~")) {
        callbacks.onPaste?.();
    }
    else if (key.ctrl && input === "v") {
        callbacks.onPaste?.();
    }
    next();
};
export const focusCycleMiddleware = (_input, key, next) => {
    if (key.tab && !key.shift) {
        callbacks.onFocusCycle?.("forward");
    }
    if (key.shift && key.tab) {
        callbacks.onFocusCycle?.("backward");
    }
    next();
};
export const defaultMiddleware = [
    ctrlCMiddleware,
    pasteDetectionMiddleware,
    focusCycleMiddleware,
];
//# sourceMappingURL=middleware.js.map