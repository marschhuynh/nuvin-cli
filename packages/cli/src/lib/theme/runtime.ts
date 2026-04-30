/**
 * Centralized theme configuration for the @nuvin/cli surface.
 *
 * Inspired by nuvin-space-public's theme runtime: detects the terminal's
 * light/dark preference + color depth and resolves a structured `Theme`
 * object with surface fills and semantic foreground colors. Components
 * read the active theme via the zustand-backed `useTheme()` hook from
 * `themeStore.ts` (no React Context).
 */

export type ThemeMode = "dark" | "light";
export type ThemeModePreference = ThemeMode | "auto";

export type ThemeColorLevel = "none" | "ansi16" | "ansi256" | "truecolor";
export type ThemeColorLevelPreference = ThemeColorLevel | "auto";

export type ThemeBackgroundPreference = "auto" | "on" | "off";

export type ThemeMessageStyle = "plain" | "tinted";
export type ThemeMessageStylePreference = ThemeMessageStyle | "auto";

export type ThemeRuntimeOptions = {
  mode?: ThemeModePreference;
  colorLevel?: ThemeColorLevelPreference;
  backgrounds?: ThemeBackgroundPreference;
  messageStyle?: ThemeMessageStylePreference;
  env?: NodeJS.ProcessEnv;
  stdout?: Pick<NodeJS.WriteStream, "getColorDepth">;
};

export type ThemeRuntime = {
  theme: Theme;
  dimTheme: Theme;
  mode: ThemeMode;
  colorLevel: ThemeColorLevel;
  useBackgrounds: boolean;
  messageStyle: ThemeMessageStyle;
};

const DARK_TOKENS = {
  cyan: "#00d9ff",
  green: "#4bac78",
  greenBright: "#5bd393",
  red: "#c5564c",
  redBright: "#d97a72",
  yellow: "#ffc371",
  orange: "#de935f",
  magenta: "#ff79c6",
  blue: "#81a2be",
  white: "#e6e6e6",
  gray: "#9b9b9b",
  black: "#1d1e1f",
  dim: "#484848",
  transparent: "transparent",
} as const;

const LIGHT_TOKENS = {
  cyan: "#0b7e9a",
  green: "#2f8f5d",
  greenBright: "#51a978",
  red: "#b74a41",
  redBright: "#cf6f66",
  yellow: "#9a7a2a",
  orange: "#b96b36",
  magenta: "#a25286",
  blue: "#3b6e90",
  white: "#1f2328",
  gray: "#6b7280",
  black: "#f2f4f7",
  dim: "#d8dde3",
  transparent: "transparent",
} as const;

type Tokens = {
  readonly cyan: string;
  readonly green: string;
  readonly greenBright: string;
  readonly red: string;
  readonly redBright: string;
  readonly yellow: string;
  readonly orange: string;
  readonly magenta: string;
  readonly blue: string;
  readonly white: string;
  readonly gray: string;
  readonly black: string;
  readonly dim: string;
  readonly transparent: string;
};

const DARK_SURFACES = {
  surface: "#1c1c1c",
  warningSurface: "#3a2f00",
  footerSurface: "#2a2a2a",
  scrollbarTrack: "#262626",
  modalSurface: "#26282b",
  modalScrim: "#0a0a0b",
} as const;

const LIGHT_SURFACES = {
  surface: "#eef2f5",
  warningSurface: "#fff4d6",
  footerSurface: "#dfe4ea",
  scrollbarTrack: "#dfe4ea",
  modalSurface: "#dde3ec",
  modalScrim: "#b6bcc4",
} as const;

const DARK_MESSAGE_TINTS = {
  user: "#1e2a3a", // faint blue
  reasoning: "#222024", // very faint, barely above base bg
  assistant: "transparent",
  error: "#3a1f1d", // faint red
  info: "transparent",
  tool: "#202733", // faint slate
} as const;

const LIGHT_MESSAGE_TINTS = {
  user: "#e1ecf7",
  reasoning: "#ececee", // very faint, barely below base bg
  assistant: "transparent",
  error: "#fbe4e1",
  info: "transparent",
  tool: "#e6ebf2",
} as const;

const PLAIN_MESSAGE_TINTS = {
  user: "transparent",
  reasoning: "transparent",
  assistant: "transparent",
  error: "transparent",
  info: "transparent",
  tool: "transparent",
} as const;

function buildTokens(mode: ThemeMode): Tokens {
  return mode === "light" ? LIGHT_TOKENS : DARK_TOKENS;
}

function buildSurfaces(mode: ThemeMode) {
  return mode === "light" ? LIGHT_SURFACES : DARK_SURFACES;
}

function buildMessageTints(mode: ThemeMode, messageStyle: ThemeMessageStyle) {
  if (messageStyle === "plain") return PLAIN_MESSAGE_TINTS;
  return mode === "light" ? LIGHT_MESSAGE_TINTS : DARK_MESSAGE_TINTS;
}

// ── Dim variant ─────────────────────────────────────────────────────────────
// When a modal opens we rebuild the theme with a dimmed palette so the
// backdrop visually recedes. We avoid ANSI dim escapes (`\x1b[2m`) because
// they're inconsistent across terminals and don't apply to backgrounds.
// Instead we blend every color toward a neutral target — much like CSS
// `opacity` over a flat background.

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parseHexColor(hex: string): { r: number; g: number; b: number } | null {
  if (!hex.startsWith("#")) return null;
  const trimmed = hex.slice(1);
  if (trimmed.length !== 6 && trimmed.length !== 3) return null;
  const expanded =
    trimmed.length === 3
      ? trimmed
          .split("")
          .map((ch) => `${ch}${ch}`)
          .join("")
      : trimmed;
  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value)) return null;
  return {
    r: (value >> 16) & 0xff,
    g: (value >> 8) & 0xff,
    b: value & 0xff,
  };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const hex = ((clampByte(r) << 16) | (clampByte(g) << 8) | clampByte(b))
    .toString(16)
    .padStart(6, "0");
  return `#${hex}`;
}

/**
 * Blend `color` toward `target` by `ratio` (0 = unchanged, 1 = fully target).
 * Returns the original string for non-hex inputs ('transparent', etc.).
 */
function blend(color: string, target: { r: number; g: number; b: number }, ratio: number): string {
  const rgb = parseHexColor(color);
  if (!rgb) return color;
  return toHex({
    r: rgb.r + (target.r - rgb.r) * ratio,
    g: rgb.g + (target.g - rgb.g) * ratio,
    b: rgb.b + (target.b - rgb.b) * ratio,
  });
}

const DIM_TARGETS = {
  // Dark mode: pull every color toward a dark gray so it sits closer to the
  // background. 50% blend is enough to feel "muted" without losing identity.
  dark: { rgb: { r: 50, g: 50, b: 50 }, ratio: 0.55 },
  // Light mode: pull toward a light gray — colors fade into the page.
  light: { rgb: { r: 215, g: 215, b: 218 }, ratio: 0.55 },
} as const;

function dimColor(mode: ThemeMode, color: string): string {
  const target = DIM_TARGETS[mode];
  return blend(color, target.rgb, target.ratio);
}

function buildDimTokens(mode: ThemeMode): Tokens {
  const base = buildTokens(mode);
  return {
    cyan: dimColor(mode, base.cyan),
    green: dimColor(mode, base.green),
    greenBright: dimColor(mode, base.greenBright),
    red: dimColor(mode, base.red),
    redBright: dimColor(mode, base.redBright),
    yellow: dimColor(mode, base.yellow),
    orange: dimColor(mode, base.orange),
    magenta: dimColor(mode, base.magenta),
    blue: dimColor(mode, base.blue),
    white: dimColor(mode, base.white),
    gray: dimColor(mode, base.gray),
    // Keep neutrals (black/dim/transparent) untouched — they're already low-key.
    black: base.black,
    dim: base.dim,
    transparent: base.transparent,
  };
}

function buildDimSurfaces(mode: ThemeMode) {
  const base = buildSurfaces(mode);
  return {
    ...base,
    surface: dimColor(mode, base.surface),
    warningSurface: dimColor(mode, base.warningSurface),
    footerSurface: dimColor(mode, base.footerSurface),
    scrollbarTrack: dimColor(mode, base.scrollbarTrack),
    // modalSurface / modalScrim left as-is; modal renders with the FULL theme.
  };
}

function buildDimMessageTints(mode: ThemeMode, messageStyle: ThemeMessageStyle) {
  const base = buildMessageTints(mode, messageStyle);
  return {
    user: dimColor(mode, base.user),
    reasoning: dimColor(mode, base.reasoning),
    assistant: dimColor(mode, base.assistant),
    error: dimColor(mode, base.error),
    info: dimColor(mode, base.info),
    tool: dimColor(mode, base.tool),
  };
}

function buildTheme(
  mode: ThemeMode,
  useBackgrounds: boolean,
  messageStyle: ThemeMessageStyle,
  variant: "normal" | "dim" = "normal",
) {
  const dimmed = variant === "dim";
  const tokens = dimmed ? buildDimTokens(mode) : buildTokens(mode);
  const surfaces = dimmed ? buildDimSurfaces(mode) : buildSurfaces(mode);
  const tints = dimmed
    ? buildDimMessageTints(mode, messageStyle)
    : buildMessageTints(mode, messageStyle);
  const surface = useBackgrounds ? surfaces.surface : tokens.transparent;
  const warningSurface = useBackgrounds ? surfaces.warningSurface : tokens.transparent;
  const footerSurface = useBackgrounds ? surfaces.footerSurface : tokens.transparent;
  // Modal surfaces are always opaque AND always full-saturation — they define
  // a focus overlay that must be visually distinct from message content
  // beneath, regardless of dimming or the useBackgrounds preference.
  const baseSurfaces = buildSurfaces(mode);
  const modalSurface = baseSurfaces.modalSurface;
  const modalScrim = baseSurfaces.modalScrim;

  return {
    tokens,

    surfaces: {
      surface,
      warningSurface,
      warningHeader: tokens.orange,
      footerSurface,
      scrollbarTrack: tokens.dim,
      scrollbarThumb: tokens.gray,
      modalSurface,
      modalScrim,
    },

    text: {
      default: tokens.white,
      dim: tokens.gray,
      inverse: tokens.black,
    },

    accent: {
      primary: tokens.green,
      info: tokens.cyan,
      warning: tokens.yellow,
      danger: tokens.red,
      thinking: tokens.magenta,
      modelName: tokens.magenta,
      approvalMode: tokens.yellow,
      brand: "#dd945d",
    },

    composer: {
      promptIdle: tokens.green,
      promptBusy: tokens.gray,
    },

    diff: {
      lineNumber: tokens.gray,
      prefix: {
        add: tokens.green,
        remove: tokens.red,
        context: tokens.gray,
      },
      background: {
        add: tokens.green,
        remove: tokens.red,
        addHighlight: tokens.greenBright,
        removeHighlight: tokens.redBright,
      },
      text: tokens.white,
      highlightText: mode === "light" ? tokens.white : tokens.black,
      contextText: tokens.gray,
      blockSeparator: tokens.magenta,
      noChanges: tokens.gray,
      noBlocks: tokens.red,
      pathLabel: tokens.cyan,
    },

    approval: {
      headerText: tokens.black,
      bodyText: tokens.white,
      yes: tokens.green,
      no: tokens.red,
      session: tokens.white,
      focusArrow: tokens.green,
      unfocused: tokens.gray,
    },

    message: {
      userPrompt: tokens.cyan,
      assistantText: tokens.white,
      reasoningTitle: tokens.magenta,
      reasoningText: tokens.gray,
      error: tokens.red,
      info: tokens.gray,
      tool: {
        approved: tokens.orange,
        running: tokens.orange,
        ok: tokens.orange,
        error: tokens.red,
        rejected: tokens.red,
        pending: tokens.yellow,
      },
      surfaces: {
        user: tints.user,
        reasoning: tints.reasoning,
        assistant: tints.assistant,
        error: tints.error,
        info: tints.info,
        tool: tints.tool,
      },
    },
  };
}

export type Theme = ReturnType<typeof buildTheme>;
export type ToolStatusKey = keyof Theme["message"]["tool"];

function parseForcedColorLevel(forceColor: string | undefined): ThemeColorLevel | undefined {
  if (!forceColor) return undefined;

  if (forceColor === "0") return "none";
  if (forceColor === "1" || forceColor.toLowerCase() === "true") return "ansi16";
  if (forceColor === "2") return "ansi256";
  if (forceColor === "3") return "truecolor";

  const numeric = Number.parseInt(forceColor, 10);
  if (Number.isNaN(numeric)) {
    return undefined;
  }

  if (numeric <= 0) return "none";
  if (numeric === 1) return "ansi16";
  if (numeric === 2) return "ansi256";
  return "truecolor";
}

export function detectTerminalColorLevel(
  stdout: Pick<NodeJS.WriteStream, "getColorDepth"> | undefined = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): ThemeColorLevel {
  if (env.NO_COLOR !== undefined || env.NODE_DISABLE_COLORS === "1") {
    return "none";
  }

  const forced = parseForcedColorLevel(env.FORCE_COLOR);
  if (forced) {
    return forced;
  }

  const depth = stdout?.getColorDepth?.(env) ?? 1;

  if (depth >= 24) return "truecolor";
  if (depth >= 8) return "ansi256";
  if (depth >= 4) return "ansi16";
  return "none";
}

function detectModeFromColorFGBG(value: string | undefined): ThemeMode | undefined {
  if (!value) return undefined;

  const parts = value.split(";");
  const bgValue = parts[parts.length - 1];
  const bg = Number.parseInt(bgValue ?? "", 10);

  if (Number.isNaN(bg)) {
    return undefined;
  }

  // ANSI palette: 0-6 are dark colors, 7-15 are light. Terminals expose the
  // background slot via $COLORFGBG ("foreground;background"), so a high
  // background index implies a light theme.
  return bg >= 7 ? "light" : "dark";
}

function resolveThemeMode(
  modePreference: ThemeModePreference | undefined,
  env: NodeJS.ProcessEnv,
): ThemeMode {
  if (modePreference === "dark" || modePreference === "light") {
    return modePreference;
  }

  const envMode = env.NUVIN_THEME_MODE?.trim().toLowerCase();
  if (envMode === "dark" || envMode === "light") {
    return envMode;
  }

  const detected = detectModeFromColorFGBG(env.COLORFGBG);
  if (detected) {
    return detected;
  }

  return "dark";
}

function resolveBackgroundPreference(
  backgroundPreference: ThemeBackgroundPreference | undefined,
  env: NodeJS.ProcessEnv,
): ThemeBackgroundPreference {
  if (backgroundPreference) {
    return backgroundPreference;
  }

  const envPref = env.NUVIN_THEME_BACKGROUNDS?.trim().toLowerCase();
  if (envPref === "on" || envPref === "off" || envPref === "auto") {
    return envPref;
  }

  return "auto";
}

function resolveMessageStyle(
  preference: ThemeMessageStylePreference | undefined,
  colorLevel: ThemeColorLevel,
  env: NodeJS.ProcessEnv,
): ThemeMessageStyle {
  const raw =
    preference ??
    (env.NUVIN_MESSAGE_STYLE?.trim().toLowerCase() as ThemeMessageStylePreference | undefined);

  let chosen: ThemeMessageStyle;
  if (raw === "plain" || raw === "tinted") {
    chosen = raw;
  } else {
    // auto / unset: keep current minimalist look by default
    chosen = "plain";
  }

  // Tinted backgrounds need at least 256 colors to render without dithering
  // artefacts; downgrade to plain on low-color terminals.
  if (chosen === "tinted" && colorLevel !== "ansi256" && colorLevel !== "truecolor") {
    return "plain";
  }

  return chosen;
}

function resolveColorLevel(
  colorPreference: ThemeColorLevelPreference | undefined,
  stdout: Pick<NodeJS.WriteStream, "getColorDepth"> | undefined,
  env: NodeJS.ProcessEnv,
): ThemeColorLevel {
  if (colorPreference && colorPreference !== "auto") {
    return colorPreference;
  }

  return detectTerminalColorLevel(stdout, env);
}

function shouldUseBackgrounds(
  preference: ThemeBackgroundPreference,
  mode: ThemeMode,
  colorLevel: ThemeColorLevel,
): boolean {
  if (preference === "off") return false;
  if (preference === "on") return colorLevel !== "none";

  // auto: light terminals tend to have soft tones already; full background
  // fills then look heavy. Also avoid colored fills when only ANSI16 (no
  // truecolor) is available since the dithering looks wrong.
  if (mode === "light") return false;
  return colorLevel === "ansi256" || colorLevel === "truecolor";
}

export function resolveThemeRuntime(options: ThemeRuntimeOptions = {}): ThemeRuntime {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? process.stdout;

  const mode = resolveThemeMode(options.mode, env);
  const colorLevel = resolveColorLevel(options.colorLevel, stdout, env);
  const backgroundPreference = resolveBackgroundPreference(options.backgrounds, env);
  const useBackgrounds = shouldUseBackgrounds(backgroundPreference, mode, colorLevel);
  const messageStyle = resolveMessageStyle(options.messageStyle, colorLevel, env);

  return {
    mode,
    colorLevel,
    useBackgrounds,
    messageStyle,
    theme: buildTheme(mode, useBackgrounds, messageStyle, "normal"),
    dimTheme: buildTheme(mode, useBackgrounds, messageStyle, "dim"),
  };
}
