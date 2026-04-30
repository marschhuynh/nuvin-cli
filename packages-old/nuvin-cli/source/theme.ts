/**
 * Centralized theme configuration for Nuvin CLI.
 * Theme values are resolved once per startup/config change and reused across renders.
 */

export type ThemeMode = 'dark' | 'light';
export type ThemeModePreference = ThemeMode | 'auto';

export type ThemeColorLevel = 'none' | 'ansi16' | 'ansi256' | 'truecolor';
export type ThemeColorLevelPreference = ThemeColorLevel | 'auto';

export type ThemeBackgroundPreference = 'auto' | 'on' | 'off';

export interface ThemeRuntimeOptions {
  mode?: ThemeModePreference;
  colorLevel?: ThemeColorLevelPreference;
  backgrounds?: ThemeBackgroundPreference;
  env?: NodeJS.ProcessEnv;
  stdout?: Pick<NodeJS.WriteStream, 'getColorDepth'>;
}

export interface ThemeRuntime {
  theme: Theme;
  mode: ThemeMode;
  colorLevel: ThemeColorLevel;
  useBackgrounds: boolean;
}

export function lightenColor(hex: string, percent: number): string {
  const num = Number.parseInt(hex.replace('#', ''), 16);
  const rf = Math.min(255, (num >> 16) + (255 - (num >> 16)) * percent);
  const gf = Math.min(255, ((num >> 8) & 0x00ff) + (255 - ((num >> 8) & 0x00ff)) * percent);
  const bf = Math.min(255, (num & 0x0000ff) + (255 - (num & 0x0000ff)) * percent);
  const r = Math.round(rf);
  const g = Math.round(gf);
  const b = Math.round(bf);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

export function darkenColor(hex: string, percent: number): string {
  const num = Number.parseInt(hex.replace('#', ''), 16);
  const rf = Math.max(0, ((num >> 16) - 255 * percent) / (1 - percent));
  const gf = Math.max(0, (((num >> 8) & 0x00ff) - 255 * percent) / (1 - percent));
  const bf = Math.max(0, ((num & 0x0000ff) - 255 * percent) / (1 - percent));
  const r = Math.round(rf);
  const g = Math.round(gf);
  const b = Math.round(bf);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

const DARK_TOKENS = {
  green: '#4bac78',
  greenBright: '#5bd393',
  cyan: '#00d9ff',
  red: '#c5564c',
  redBright: lightenColor('#c5564c', 0.3),
  orange: '#de935f',
  yellow: '#ffc371',
  dimYellow: '#a28152',
  blue: '#81a2be',
  magenta: '#ff79c6',
  white: '#e6e6e6',
  gray: '#9b9b9b',
  black: '#1d1e1f',
  dim: '#303030',
  transparent: 'transparent',
};

const LIGHT_TOKENS = {
  green: '#2f8f5d',
  greenBright: '#51a978',
  cyan: '#0b7e9a',
  red: '#b74a41',
  redBright: lightenColor('#b74a41', 0.25),
  orange: '#b96b36',
  yellow: '#9a7a2a',
  dimYellow: '#b5a170',
  blue: '#3b6e90',
  magenta: '#a25286',
  white: '#1f2328',
  gray: '#6b7280',
  black: '#f2f4f7',
  dim: '#d8dde3',
  transparent: 'transparent',
};

function buildTokens(mode: ThemeMode) {
  return mode === 'light' ? LIGHT_TOKENS : DARK_TOKENS;
}

function buildTheme(mode: ThemeMode, useBackgrounds: boolean) {
  const tokens = buildTokens(mode);
  const isLight = mode === 'light';

  const colors = {
    success: tokens.green,
    error: tokens.red,
    warning: tokens.yellow,
    info: tokens.cyan,

    primary: tokens.green,
    secondary: tokens.magenta,
    accent: tokens.orange,
    muted: tokens.gray,

    user: tokens.cyan,
    assistant: tokens.green,
    system: tokens.gray,
    thinking: tokens.yellow,

    tool: tokens.green,
    toolResult: tokens.green,
    toolSuccess: tokens.green,
    toolError: tokens.red,
    toolDuration: tokens.gray,

    selected: tokens.green,
    unselected: tokens.transparent,
    highlight: tokens.green,

    text: tokens.white,
    textDim: tokens.gray,
    textBold: tokens.white,

    background: useBackgrounds ? (isLight ? '#eef2f5' : '#1e2123') : tokens.transparent,

    border: tokens.gray,

    badge: {
      info: tokens.cyan,
      success: tokens.green,
      warning: tokens.yellow,
      error: tokens.red,
    },
  };

  return {
    tokens,
    colors,

    status: {
      success: tokens.green,
      warning: tokens.yellow,
      error: tokens.red,
      pending: tokens.yellow,
      running: tokens.cyan,
      idle: tokens.gray,
    },

    messageTypes: {
      user: tokens.cyan,
      assistant: tokens.yellow,
      tool: tokens.green,
      tool_result: tokens.green,
      system: tokens.gray,
      warning: tokens.yellow,
      error: tokens.red,
      info: tokens.cyan,
      thinking: tokens.gray,
    },

    modal: {
      title: '#1f2328',
      subtitle: '#1f2328',
      titleBackground: colors.accent,
      sectionHeader: tokens.yellow,
      keyBinding: tokens.green,
      description: tokens.gray,
      help: tokens.gray,
      background: useBackgrounds ? (isLight ? '#f7f8fa' : '#1d1e1f') : tokens.transparent,
      footerBackground: useBackgrounds ? (isLight ? '#d8dde3' : tokens.gray) : tokens.transparent,
      footerDimText: tokens.gray,
      footerText: '#1f2328',
    },

    help: {
      title: tokens.cyan,
      subtitle: tokens.gray,
      sectionHeader: tokens.yellow,
      keyBinding: tokens.green,
      description: tokens.gray,
    },

    auth: {
      provider: tokens.green,
      waiting: tokens.gray,
      code: tokens.yellow,
      link: tokens.cyan,
      success: tokens.green,
      error: tokens.red,
    },

    footer: {
      provider: tokens.yellow,
      model: tokens.gray,
      status: tokens.gray,
      thinking: tokens.gray,
      infoBg: useBackgrounds ? tokens.dim : tokens.transparent,
      currentDir: tokens.blue,
      gitBranch: tokens.white,
    },

    input: {
      prompt: tokens.green,
      placeholder: tokens.gray,
      text: tokens.white,
    },

    history: {
      selected: tokens.white,
      unselected: tokens.gray,
      badge: tokens.gray,
      timestamp: tokens.gray,
      title: tokens.cyan,
      help: tokens.gray,
      keybind: tokens.yellow,
    },

    toolApproval: {
      title: tokens.yellow,
      toolName: tokens.white,
      description: tokens.gray,
      paramKey: tokens.cyan,
      paramValue: tokens.white,
      statusText: '#1f2328',
      approved: tokens.green,
      denied: tokens.red,
      actionSelected: tokens.green,
      actionApprove: tokens.green,
      actionDeny: tokens.red,
      actionReview: tokens.blue,
    },

    model: {
      title: tokens.cyan,
      subtitle: tokens.gray,
      label: tokens.green,
      help: tokens.gray,
      input: tokens.white,
      item: tokens.white,
      selectedItem: colors.accent,
    },

    thinking: {
      title: tokens.cyan,
      subtitle: tokens.gray,
    },

    welcome: {
      title: tokens.orange,
      subtitle: tokens.gray,
      hint: tokens.dim,
    },

    fileEdit: {
      title: tokens.yellow,
      label: tokens.cyan,
      value: tokens.white,
      content: tokens.gray,
      searchHeader: tokens.green,
      replaceHeader: tokens.red,
      error: tokens.red,
    },

    diff: {
      lineNumber: tokens.gray,
      prefix: {
        add: tokens.green,
        remove: tokens.red,
        context: tokens.gray,
      },
      background: {
        add: useBackgrounds ? (isLight ? '#d9f3e1' : tokens.green) : tokens.transparent,
        remove: useBackgrounds ? (isLight ? '#f6dede' : tokens.red) : tokens.transparent,
        addHighlight: useBackgrounds ? (isLight ? '#b8e7c8' : tokens.greenBright) : tokens.transparent,
        removeHighlight: useBackgrounds ? (isLight ? '#edbcbc' : tokens.redBright) : tokens.transparent,
      },
      text: useBackgrounds ? '#1f2328' : tokens.white,
      contextText: tokens.gray,
      blockSeparator: tokens.magenta,
      noChanges: tokens.gray,
      noBlocks: tokens.red,
      pathLabel: tokens.cyan,
    },
  };
}

export type Theme = ReturnType<typeof buildTheme>;

function parseForcedColorLevel(forceColor: string | undefined): ThemeColorLevel | undefined {
  if (!forceColor) return undefined;

  if (forceColor === '0') return 'none';
  if (forceColor === '1' || forceColor.toLowerCase() === 'true') return 'ansi16';
  if (forceColor === '2') return 'ansi256';
  if (forceColor === '3') return 'truecolor';

  const numericForce = Number.parseInt(forceColor, 10);
  if (Number.isNaN(numericForce)) {
    return undefined;
  }

  if (numericForce <= 0) return 'none';
  if (numericForce === 1) return 'ansi16';
  if (numericForce === 2) return 'ansi256';
  return 'truecolor';
}

export function detectTerminalColorLevel(
  stdout: Pick<NodeJS.WriteStream, 'getColorDepth'> | undefined = process.stdout,
  env: NodeJS.ProcessEnv = process.env,
): ThemeColorLevel {
  if (env.NO_COLOR !== undefined || env.NODE_DISABLE_COLORS === '1') {
    return 'none';
  }

  const forced = parseForcedColorLevel(env.FORCE_COLOR);
  if (forced) {
    return forced;
  }

  const depth = stdout?.getColorDepth?.(env) ?? 1;

  if (depth >= 24) {
    return 'truecolor';
  }
  if (depth >= 8) {
    return 'ansi256';
  }
  if (depth >= 4) {
    return 'ansi16';
  }

  return 'none';
}

function detectModeFromColorFGBG(value: string | undefined): ThemeMode | undefined {
  if (!value) {
    return undefined;
  }

  const parts = value.split(';');
  const bgValue = parts[parts.length - 1];
  const bg = Number.parseInt(bgValue || '', 10);

  if (Number.isNaN(bg)) {
    return undefined;
  }

  return bg >= 7 ? 'light' : 'dark';
}

function resolveThemeMode(modePreference: ThemeModePreference | undefined, env: NodeJS.ProcessEnv): ThemeMode {
  if (modePreference === 'dark' || modePreference === 'light') {
    return modePreference;
  }

  const envMode = env.NUVIN_THEME_MODE?.trim().toLowerCase();
  if (envMode === 'dark' || envMode === 'light') {
    return envMode;
  }

  const detected = detectModeFromColorFGBG(env.COLORFGBG);
  if (detected) {
    return detected;
  }

  return 'dark';
}

function resolveBackgroundPreference(
  backgroundPreference: ThemeBackgroundPreference | undefined,
  env: NodeJS.ProcessEnv,
): ThemeBackgroundPreference {
  if (backgroundPreference) {
    return backgroundPreference;
  }

  const envPref = env.NUVIN_THEME_BACKGROUNDS?.trim().toLowerCase();
  if (envPref === 'on' || envPref === 'off' || envPref === 'auto') {
    return envPref;
  }

  return 'auto';
}

function resolveColorLevel(
  colorPreference: ThemeColorLevelPreference | undefined,
  stdout: Pick<NodeJS.WriteStream, 'getColorDepth'> | undefined,
  env: NodeJS.ProcessEnv,
): ThemeColorLevel {
  if (colorPreference && colorPreference !== 'auto') {
    return colorPreference;
  }

  return detectTerminalColorLevel(stdout, env);
}

function shouldUseBackgrounds(
  preference: ThemeBackgroundPreference,
  mode: ThemeMode,
  colorLevel: ThemeColorLevel,
): boolean {
  if (preference === 'off') {
    return false;
  }

  if (preference === 'on') {
    return colorLevel !== 'none';
  }

  if (mode === 'light') {
    return false;
  }

  return colorLevel === 'ansi256' || colorLevel === 'truecolor';
}

export function resolveThemeRuntime(options: ThemeRuntimeOptions = {}): ThemeRuntime {
  const env = options.env ?? process.env;
  const stdout = options.stdout ?? process.stdout;

  const mode = resolveThemeMode(options.mode, env);
  const colorLevel = resolveColorLevel(options.colorLevel, stdout, env);
  const backgroundPreference = resolveBackgroundPreference(options.backgrounds, env);
  const useBackgrounds = shouldUseBackgrounds(backgroundPreference, mode, colorLevel);

  return {
    mode,
    colorLevel,
    useBackgrounds,
    theme: buildTheme(mode, useBackgrounds),
  };
}

export const theme: Theme = buildTheme('dark', true);

export function applyThemeRuntime(runtime: ThemeRuntime): Theme {
  const nextTheme = runtime.theme;

  theme.tokens = nextTheme.tokens;
  theme.colors = nextTheme.colors;
  theme.status = nextTheme.status;
  theme.messageTypes = nextTheme.messageTypes;
  theme.modal = nextTheme.modal;
  theme.help = nextTheme.help;
  theme.auth = nextTheme.auth;
  theme.footer = nextTheme.footer;
  theme.input = nextTheme.input;
  theme.history = nextTheme.history;
  theme.toolApproval = nextTheme.toolApproval;
  theme.model = nextTheme.model;
  theme.thinking = nextTheme.thinking;
  theme.welcome = nextTheme.welcome;
  theme.fileEdit = nextTheme.fileEdit;
  theme.diff = nextTheme.diff;

  return theme;
}

export function resolveAndApplyThemeRuntime(options: ThemeRuntimeOptions = {}): ThemeRuntime {
  const runtime = resolveThemeRuntime(options);
  applyThemeRuntime(runtime);
  return runtime;
}

export type ColorToken = keyof Theme['tokens'];
export type ColorKey = keyof Theme['colors'];
export type StatusColor = keyof Theme['status'];
export type MessageTypeColor = keyof Theme['messageTypes'];

export function getStatusColor(status: 'success' | 'error' | 'pending' | 'running' | 'idle'): string {
  return theme.status[status];
}

export function getMessageTypeColor(type: keyof Theme['messageTypes']): string {
  return theme.messageTypes[type] || theme.colors.text;
}

export function getColorToken(token: ColorToken): string {
  return theme.tokens[token];
}
