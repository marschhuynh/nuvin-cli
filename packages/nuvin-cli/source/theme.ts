/**
 * Centralized theme configuration for Nuvin CLI
 * Contains all color values used across the application
 */

// 253,88,91
export const COLOR_TOKENS = {
  green: '#1baf6a',
  cyan: '#00d9ff',
  red: '#FF5F6D',
  orange: '#de935f',
  yellow: '#FFC371',
  blue: '#81a2be',
  magenta: '#ff79c6',
  white: '#ffffff',
  gray: '#6c6c6c',
  black: '#282a36',
  dim: '#303030',
  transparent: 'transparent',
};

export const theme = {
  tokens: COLOR_TOKENS,

  // Primary colors (using COLOR_TOKENS)
  colors: {
    // Status colors
    success: COLOR_TOKENS.green,
    error: COLOR_TOKENS.red,
    warning: COLOR_TOKENS.yellow,
    info: COLOR_TOKENS.cyan,

    // UI element colors
    primary: COLOR_TOKENS.green,
    secondary: COLOR_TOKENS.magenta,
    accent: COLOR_TOKENS.orange,
    muted: COLOR_TOKENS.gray,

    // Message type colors
    user: COLOR_TOKENS.cyan,
    assistant: COLOR_TOKENS.green,
    system: COLOR_TOKENS.gray,
    thinking: COLOR_TOKENS.yellow,

    // Tool-related colors
    tool: COLOR_TOKENS.green,
    toolResult: COLOR_TOKENS.green,
    toolSuccess: COLOR_TOKENS.green,
    toolError: COLOR_TOKENS.red,
    toolDuration: COLOR_TOKENS.gray,

    // Interactive elements
    selected: COLOR_TOKENS.green,
    unselected: COLOR_TOKENS.transparent,
    highlight: COLOR_TOKENS.green,

    // Text variants
    text: COLOR_TOKENS.white,
    textDim: COLOR_TOKENS.gray,
    textBold: COLOR_TOKENS.white,

    // Backgrounds and borders
    background: COLOR_TOKENS.black,
    border: COLOR_TOKENS.gray,

    // Badge and status indicators
    badge: {
      info: COLOR_TOKENS.cyan,
      success: COLOR_TOKENS.green,
      warning: COLOR_TOKENS.yellow,
      error: COLOR_TOKENS.red,
    },
  },

  // Status mappings for tool results and execution states
  status: {
    success: COLOR_TOKENS.green,
    error: COLOR_TOKENS.red,
    pending: COLOR_TOKENS.yellow,
    running: COLOR_TOKENS.cyan,
    idle: COLOR_TOKENS.gray,
  },

  // Message line type colors
  messageTypes: {
    user: COLOR_TOKENS.cyan,
    assistant: COLOR_TOKENS.green,
    tool: COLOR_TOKENS.green,
    tool_result: COLOR_TOKENS.green,
    system: COLOR_TOKENS.gray,
    warning: COLOR_TOKENS.yellow,
    error: COLOR_TOKENS.red,
    info: COLOR_TOKENS.cyan,
    thinking: COLOR_TOKENS.yellow,
  },

  // Command and help colors
  modal: {
    title: COLOR_TOKENS.cyan,
    subtitle: COLOR_TOKENS.gray,
    sectionHeader: COLOR_TOKENS.yellow,
    keyBinding: COLOR_TOKENS.green,
    description: COLOR_TOKENS.gray,
    help: COLOR_TOKENS.gray,
  },

  // Command and help colors
  help: {
    title: COLOR_TOKENS.cyan,
    subtitle: COLOR_TOKENS.gray,
    sectionHeader: COLOR_TOKENS.yellow,
    keyBinding: COLOR_TOKENS.green,
    description: COLOR_TOKENS.gray,
  },

  // Authentication flow colors
  auth: {
    provider: COLOR_TOKENS.green,
    waiting: COLOR_TOKENS.gray,
    code: COLOR_TOKENS.yellow,
    link: COLOR_TOKENS.cyan,
    success: COLOR_TOKENS.green,
    error: COLOR_TOKENS.red,
  },

  // Footer and status bar colors
  footer: {
    provider: COLOR_TOKENS.yellow,
    model: COLOR_TOKENS.gray,
    status: COLOR_TOKENS.gray,
    thinking: COLOR_TOKENS.gray,
    infoBg: COLOR_TOKENS.dim,
    currentDir: COLOR_TOKENS.blue,
    gitBranch: COLOR_TOKENS.white,
  },

  // Input area colors
  input: {
    prompt: COLOR_TOKENS.green,
    placeholder: COLOR_TOKENS.gray,
    text: COLOR_TOKENS.white,
  },

  // History selection colors
  history: {
    selected: COLOR_TOKENS.white,
    unselected: COLOR_TOKENS.gray,
    badge: COLOR_TOKENS.gray,
    timestamp: COLOR_TOKENS.gray,
    title: COLOR_TOKENS.cyan,
    help: COLOR_TOKENS.gray,
    keybind: COLOR_TOKENS.yellow,
  },

  // Tool approval prompt colors
  toolApproval: {
    title: COLOR_TOKENS.yellow,
    toolName: COLOR_TOKENS.white,
    description: COLOR_TOKENS.gray,
    paramKey: COLOR_TOKENS.cyan,
    paramValue: COLOR_TOKENS.white,
    statusText: COLOR_TOKENS.gray,
    approved: COLOR_TOKENS.green,
    denied: COLOR_TOKENS.red,
    actionSelected: COLOR_TOKENS.green,
    actionApprove: COLOR_TOKENS.green,
    actionDeny: COLOR_TOKENS.red,
    actionReview: COLOR_TOKENS.blue,
  },

  // Model selection colors
  model: {
    title: COLOR_TOKENS.cyan,
    subtitle: COLOR_TOKENS.gray,
    label: COLOR_TOKENS.green,
    help: COLOR_TOKENS.gray,
    input: COLOR_TOKENS.white,
    item: COLOR_TOKENS.white,
    selectedItem: COLOR_TOKENS.green,
  },

  // Thinking mode colors
  thinking: {
    title: COLOR_TOKENS.cyan,
    subtitle: COLOR_TOKENS.gray,
  },

  // Welcome message colors
  welcome: {
    title: COLOR_TOKENS.orange,
    subtitle: COLOR_TOKENS.gray,
    hint: COLOR_TOKENS.dim,
  },

  // File edit preview colors
  fileEdit: {
    title: COLOR_TOKENS.yellow,
    label: COLOR_TOKENS.cyan,
    value: COLOR_TOKENS.white,
    content: COLOR_TOKENS.gray,
    searchHeader: COLOR_TOKENS.green,
    replaceHeader: COLOR_TOKENS.red,
    error: COLOR_TOKENS.red,
  },
} as const;

// Type exports for TypeScript support
export type Theme = typeof theme;
export type ColorToken = keyof typeof theme.tokens;
export type ColorKey = keyof typeof theme.colors;
export type StatusColor = keyof typeof theme.status;
export type MessageTypeColor = keyof typeof theme.messageTypes;

// Helper function to get color by path
export function getThemeColor(path: string): string {
  const parts = path.split('.');
  let value: unknown = theme;

  for (const part of parts) {
    if (value && typeof value === 'object' && part in value) {
      value = (value as Record<string, unknown>)[part];
    } else {
      return 'white'; // Default fallback
    }
  }

  return typeof value === 'string' ? value : 'white';
}

// Helper function for status colors
export function getStatusColor(status: 'success' | 'error' | 'pending' | 'running' | 'idle'): string {
  return theme.status[status];
}

// Helper function for message type colors
export function getMessageTypeColor(type: keyof typeof theme.messageTypes): string {
  return theme.messageTypes[type] || theme.colors.text;
}

// Helper function to get hex token value
export function getColorToken(token: ColorToken): string {
  return theme.tokens[token];
}
