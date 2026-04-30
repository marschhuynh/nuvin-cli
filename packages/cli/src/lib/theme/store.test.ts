import { beforeEach, describe, expect, it } from "vitest";

import { getTheme, initThemeStore, setThemeDimmed, themeStore } from "#src/lib/theme/store.js";

describe("themeStore", () => {
  beforeEach(() => {
    initThemeStore({
      mode: "dark",
      colorLevel: "truecolor",
      backgrounds: "on",
      env: {} as NodeJS.ProcessEnv,
    });
  });

  it("initThemeStore writes a resolved runtime into state", () => {
    const runtime = initThemeStore({
      mode: "light",
      colorLevel: "truecolor",
      backgrounds: "on",
      env: {} as NodeJS.ProcessEnv,
    });

    const state = themeStore.getState();
    expect(state.mode).toBe("light");
    expect(state.colorLevel).toBe("truecolor");
    expect(state.useBackgrounds).toBe(true);
    expect(state.theme).toBe(runtime.theme);
  });

  it("reloadTheme picks up env changes between calls", () => {
    initThemeStore({
      mode: "dark",
      colorLevel: "truecolor",
      env: {} as NodeJS.ProcessEnv,
    });
    expect(themeStore.getState().mode).toBe("dark");

    themeStore.getState().reloadTheme({
      env: { COLORFGBG: "0;15" } as NodeJS.ProcessEnv,
    });

    expect(themeStore.getState().mode).toBe("light");
    expect(themeStore.getState().useBackgrounds).toBe(false);
  });

  it("getTheme returns the active theme snapshot", () => {
    const theme = getTheme();
    expect(theme).toBe(themeStore.getState().theme);
    expect(theme.accent.primary).toBe(theme.tokens.green);
  });

  it("setThemeDimmed swaps useTheme to the dim variant and back", () => {
    const normal = themeStore.getState().theme;
    const dim = themeStore.getState().dimTheme;
    expect(dim).not.toBe(normal);
    expect(dim.tokens.cyan).not.toBe(normal.tokens.cyan);

    expect(getTheme()).toBe(normal);
    setThemeDimmed(true);
    expect(themeStore.getState().dimmed).toBe(true);
    expect(getTheme()).toBe(dim);
    setThemeDimmed(false);
    expect(getTheme()).toBe(normal);
  });

  it("dim theme keeps modal surfaces at full saturation", () => {
    const { theme, dimTheme } = themeStore.getState();
    expect(dimTheme.surfaces.modalSurface).toBe(theme.surfaces.modalSurface);
    expect(dimTheme.surfaces.modalScrim).toBe(theme.surfaces.modalScrim);
  });
});
