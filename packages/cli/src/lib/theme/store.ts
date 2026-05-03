/**
 * themeStore — zustand store holding the resolved theme runtime.
 *
 * Components subscribe via `useTheme()` (React) or read snapshots via
 * `themeStore.getState().theme` (vanilla). No React Context is used —
 * the store is a singleton, mirroring the focusStore pattern in
 * @nuvin/ink-input.
 *
 * The store is initialised once at app startup with `initThemeStore`,
 * which inspects the terminal (COLORFGBG, FORCE_COLOR, NO_COLOR, color
 * depth) to pick the right light/dark variant. It can be re-resolved
 * later via `reloadTheme()` if the user toggles preferences at runtime.
 */
import { useStore } from "zustand";
import { createStore } from "zustand/vanilla";

import {
  resolveThemeRuntime,
  type Theme,
  type ThemeColorLevel,
  type ThemeMessageStyle,
  type ThemeMode,
  type ThemeRuntime,
  type ThemeRuntimeOptions,
} from "#src/lib/theme/runtime.js";

type ThemeState = {
  theme: Theme;
  dimTheme: Theme;
  dimmed: boolean;
  mode: ThemeMode;
  colorLevel: ThemeColorLevel;
  useBackgrounds: boolean;
  messageStyle: ThemeMessageStyle;
};

type ThemeActions = {
  setRuntime: (runtime: ThemeRuntime) => void;
  reloadTheme: (options?: ThemeRuntimeOptions) => ThemeRuntime;
  setDimmed: (dimmed: boolean) => void;
};

function runtimeToState(runtime: ThemeRuntime): Omit<ThemeState, "dimmed"> {
  return {
    theme: runtime.theme,
    dimTheme: runtime.dimTheme,
    mode: runtime.mode,
    colorLevel: runtime.colorLevel,
    useBackgrounds: runtime.useBackgrounds,
    messageStyle: runtime.messageStyle,
  };
}

// Default to a dark, backgrounds-on theme so any consumer importing the
// store before `initThemeStore` runs (e.g. tests) still gets a usable theme.
const DEFAULT_RUNTIME: ThemeRuntime = resolveThemeRuntime({
  mode: "dark",
  colorLevel: "truecolor",
  backgrounds: "on",
  env: {} as NodeJS.ProcessEnv,
});

export const themeStore = createStore<ThemeState & ThemeActions>()((set) => ({
  ...runtimeToState(DEFAULT_RUNTIME),
  dimmed: false,

  setRuntime: (runtime) => {
    set(runtimeToState(runtime));
  },

  reloadTheme: (options) => {
    const runtime = resolveThemeRuntime(options);
    set(runtimeToState(runtime));
    return runtime;
  },

  setDimmed: (dimmed) => {
    set((state) => (state.dimmed === dimmed ? state : { ...state, dimmed }));
  },
}));

/**
 * Resolve the active theme from the current process and write it into the
 * store. Call once during app bootstrap before rendering. Returns the
 * resolved runtime so the caller can log it / pass it on.
 */
export function initThemeStore(options?: ThemeRuntimeOptions): ThemeRuntime {
  return themeStore.getState().reloadTheme(options);
}

/**
 * React hook returning the active `Theme`. When the dim flag is set (e.g.
 * a modal is open) this returns the dim variant so the UI visually recedes.
 * Components that should NOT dim — typically the modal itself — must use
 * {@link useFullTheme} instead.
 */
export function useTheme(): Theme {
  return useStore(themeStore, (state) => (state.dimmed ? state.dimTheme : state.theme));
}

/**
 * React hook returning the always-full-saturation `Theme`, regardless of
 * the dim flag. Use this from overlay components (Modal, ApprovalModal)
 * that must remain visually prominent while the rest of the UI dims.
 */
export function useFullTheme(): Theme {
  return useStore(themeStore, (state) => state.theme);
}

/** Vanilla snapshot accessor for use outside React components. */
export function getTheme(): Theme {
  const state = themeStore.getState();
  return state.dimmed ? state.dimTheme : state.theme;
}

/** Set/clear the dim flag — call when opening or closing a modal overlay. */
export function setThemeDimmed(dimmed: boolean): void {
  themeStore.getState().setDimmed(dimmed);
}
