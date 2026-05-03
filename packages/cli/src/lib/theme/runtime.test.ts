import { describe, expect, it } from "vitest";

import {
  detectTerminalColorLevel,
  resolveThemeRuntime,
  type ThemeColorLevel,
  type ThemeMode,
} from "#src/lib/theme/runtime.js";

describe("detectTerminalColorLevel", () => {
  it("returns none when NO_COLOR is set", () => {
    const colorLevel = detectTerminalColorLevel(undefined, {
      NO_COLOR: "1",
    } as NodeJS.ProcessEnv);

    expect(colorLevel).toBe<ThemeColorLevel>("none");
  });

  it("honours FORCE_COLOR=2 as ansi256", () => {
    const colorLevel = detectTerminalColorLevel(undefined, {
      FORCE_COLOR: "2",
    } as NodeJS.ProcessEnv);

    expect(colorLevel).toBe<ThemeColorLevel>("ansi256");
  });

  it("uses stdout color depth when no env override is set", () => {
    const stdout = { getColorDepth: () => 24 };
    expect(detectTerminalColorLevel(stdout, {} as NodeJS.ProcessEnv)).toBe<ThemeColorLevel>(
      "truecolor",
    );
    expect(
      detectTerminalColorLevel({ getColorDepth: () => 8 }, {} as NodeJS.ProcessEnv),
    ).toBe<ThemeColorLevel>("ansi256");
    expect(
      detectTerminalColorLevel({ getColorDepth: () => 4 }, {} as NodeJS.ProcessEnv),
    ).toBe<ThemeColorLevel>("ansi16");
    expect(
      detectTerminalColorLevel({ getColorDepth: () => 1 }, {} as NodeJS.ProcessEnv),
    ).toBe<ThemeColorLevel>("none");
  });
});

describe("resolveThemeRuntime", () => {
  it("detects light mode from COLORFGBG and disables backgrounds in auto mode", () => {
    const runtime = resolveThemeRuntime({
      env: { COLORFGBG: "0;15" } as NodeJS.ProcessEnv,
    });

    expect(runtime.mode).toBe<ThemeMode>("light");
    expect(runtime.useBackgrounds).toBe(false);
    expect(runtime.theme.surfaces.surface).toBe("transparent");
    expect(runtime.theme.surfaces.warningSurface).toBe("transparent");
  });

  it("detects dark mode from COLORFGBG with low background index", () => {
    const runtime = resolveThemeRuntime({
      env: { COLORFGBG: "15;0", FORCE_COLOR: "3" } as NodeJS.ProcessEnv,
    });

    expect(runtime.mode).toBe<ThemeMode>("dark");
    expect(runtime.useBackgrounds).toBe(true);
    expect(runtime.theme.surfaces.surface).toMatch(/^#/);
  });

  it("respects NUVIN_THEME_MODE override", () => {
    const runtime = resolveThemeRuntime({
      env: {
        COLORFGBG: "0;15",
        NUVIN_THEME_MODE: "dark",
        FORCE_COLOR: "3",
      } as NodeJS.ProcessEnv,
    });

    expect(runtime.mode).toBe<ThemeMode>("dark");
  });

  it("enables backgrounds when explicitly set to on", () => {
    const runtime = resolveThemeRuntime({
      mode: "light",
      backgrounds: "on",
      colorLevel: "truecolor",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(runtime.useBackgrounds).toBe(true);
    expect(runtime.theme.surfaces.surface).not.toBe("transparent");
  });

  it("disables backgrounds when colorLevel is none even if backgrounds=on", () => {
    const runtime = resolveThemeRuntime({
      mode: "dark",
      backgrounds: "on",
      colorLevel: "none",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(runtime.useBackgrounds).toBe(false);
  });

  it("produces a complete theme with semantic accent colors", () => {
    const runtime = resolveThemeRuntime({
      mode: "dark",
      colorLevel: "truecolor",
      backgrounds: "on",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(runtime.theme.accent.primary).toBe(runtime.theme.tokens.green);
    expect(runtime.theme.accent.danger).toBe(runtime.theme.tokens.red);
    expect(runtime.theme.message.tool.ok).toBe(runtime.theme.tokens.orange);
    expect(runtime.theme.message.tool.error).toBe(runtime.theme.tokens.red);
  });

  it("picks light token palette for light mode", () => {
    const dark = resolveThemeRuntime({
      mode: "dark",
      colorLevel: "truecolor",
      env: {} as NodeJS.ProcessEnv,
    });
    const light = resolveThemeRuntime({
      mode: "light",
      colorLevel: "truecolor",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(dark.theme.tokens.cyan).not.toBe(light.theme.tokens.cyan);
    expect(dark.theme.tokens.green).not.toBe(light.theme.tokens.green);
  });

  it("defaults messageStyle to plain with transparent surfaces", () => {
    const runtime = resolveThemeRuntime({
      mode: "dark",
      colorLevel: "truecolor",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(runtime.messageStyle).toBe("plain");
    expect(runtime.theme.message.surfaces.user).toBe("transparent");
    expect(runtime.theme.message.surfaces.reasoning).toBe("transparent");
    expect(runtime.theme.message.surfaces.assistant).toBe("transparent");
  });

  it("honours messageStyle=tinted with role-specific dark surfaces", () => {
    const runtime = resolveThemeRuntime({
      mode: "dark",
      colorLevel: "truecolor",
      messageStyle: "tinted",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(runtime.messageStyle).toBe("tinted");
    expect(runtime.theme.message.surfaces.user).toMatch(/^#/);
    expect(runtime.theme.message.surfaces.reasoning).toMatch(/^#/);
    expect(runtime.theme.message.surfaces.user).not.toBe(runtime.theme.message.surfaces.reasoning);
    // assistant stays unfilled so reading the actual reply feels light
    expect(runtime.theme.message.surfaces.assistant).toBe("transparent");
  });

  it("reads messageStyle from NUVIN_MESSAGE_STYLE env var", () => {
    const runtime = resolveThemeRuntime({
      mode: "dark",
      colorLevel: "truecolor",
      env: { NUVIN_MESSAGE_STYLE: "tinted" } as NodeJS.ProcessEnv,
    });

    expect(runtime.messageStyle).toBe("tinted");
  });

  it("downgrades tinted to plain on low-color terminals", () => {
    const runtime = resolveThemeRuntime({
      mode: "dark",
      colorLevel: "ansi16",
      messageStyle: "tinted",
      env: {} as NodeJS.ProcessEnv,
    });

    expect(runtime.messageStyle).toBe("plain");
    expect(runtime.theme.message.surfaces.user).toBe("transparent");
  });
});
