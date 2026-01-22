/**
 * Shared test utility for mocking React contexts used across snapshot tests.
 *
 * This provides a single source of truth for all context mocks, ensuring
 * consistency across test files and making it easy to update mock values.
 */

import { vi } from 'vitest';

/**
 * Default mock theme object with all required properties.
 */
export const mockTheme = {
  tokens: {
    green: 'green',
    greenBright: 'greenBright',
    cyan: 'cyan',
    red: 'red',
    redBright: 'redBright',
    orange: 'orange',
    yellow: 'yellow',
    dimYellow: 'dimYellow',
    blue: 'blue',
    magenta: 'magenta',
    white: 'white',
    gray: 'gray',
    black: 'black',
    dim: 'dim',
    transparent: 'transparent',
  },
  colors: {
    success: 'green',
    error: 'red',
    warning: 'yellow',
    info: 'cyan',
    primary: 'green',
    secondary: 'magenta',
    accent: 'orange',
    muted: 'gray',
    user: 'cyan',
    assistant: 'green',
    system: 'gray',
    thinking: 'yellow',
    tool: 'green',
    toolResult: 'green',
    toolSuccess: 'green',
    toolError: 'red',
    toolDuration: 'gray',
    selected: 'green',
    unselected: 'transparent',
    highlight: 'green',
    text: 'white',
    textDim: 'gray',
    textBold: 'white',
    background: '#1e2123',
    border: 'gray',
    badge: {
      info: 'cyan',
      success: 'green',
      warning: 'yellow',
      error: 'red',
    },
  },
  status: {
    success: 'green',
    warning: 'yellow',
    error: 'red',
    pending: 'yellow',
    running: 'cyan',
    idle: 'gray',
  },
  messageTypes: {
    user: 'cyan',
    assistant: 'yellow',
    tool: 'green',
    tool_result: 'green',
    system: 'gray',
    warning: 'yellow',
    error: 'red',
    info: 'cyan',
    thinking: 'gray',
  },
  modal: {
    title: 'black',
    subtitle: 'black',
    titleBackground: 'orange',
    sectionHeader: 'yellow',
    keyBinding: 'green',
    description: 'gray',
    help: 'gray',
    background: 'black',
    footerBackground: 'gray',
    footerDimText: 'gray',
    footerText: 'black',
  },
  help: {
    title: 'cyan',
    subtitle: 'gray',
    sectionHeader: 'yellow',
    keyBinding: 'green',
    description: 'gray',
  },
  auth: {
    provider: 'green',
    waiting: 'gray',
    code: 'yellow',
    link: 'cyan',
    success: 'green',
    error: 'red',
  },
  footer: {
    provider: 'yellow',
    model: 'gray',
    status: 'gray',
    thinking: 'gray',
    infoBg: 'dim',
    currentDir: 'blue',
    gitBranch: 'white',
  },
  input: {
    prompt: 'green',
    placeholder: 'gray',
    text: 'white',
  },
  history: {
    selected: 'white',
    unselected: 'gray',
    badge: 'gray',
    timestamp: 'gray',
    title: 'cyan',
    help: 'gray',
    keybind: 'yellow',
  },
  toolApproval: {
    title: 'yellow',
    toolName: 'white',
    description: 'gray',
    paramKey: 'cyan',
    paramValue: 'white',
    statusText: 'black',
    approved: 'green',
    denied: 'red',
    actionSelected: 'green',
    actionApprove: 'green',
    actionDeny: 'red',
    actionReview: 'blue',
  },
  model: {
    title: 'cyan',
    subtitle: 'gray',
    label: 'green',
    help: 'gray',
    input: 'white',
    item: 'white',
    selectedItem: 'orange',
  },
  thinking: {
    title: 'cyan',
    subtitle: 'gray',
  },
  welcome: {
    title: 'orange',
    subtitle: 'gray',
    hint: 'dim',
  },
  fileEdit: {
    title: 'yellow',
    label: 'cyan',
    value: 'white',
    content: 'gray',
    searchHeader: 'green',
    replaceHeader: 'red',
    error: 'red',
  },
  diff: {
    lineNumber: 'gray',
    prefix: {
      add: 'green',
      remove: 'red',
      context: 'gray',
    },
    background: {
      add: 'green',
      remove: 'red',
      addHighlight: 'greenBright',
      removeHighlight: 'redBright',
    },
    text: 'black',
    contextText: 'gray',
    blockSeparator: 'magenta',
    noChanges: 'gray',
    noBlocks: 'red',
    pathLabel: 'cyan',
  },
} as const;

export const mockAltMode = {
  altMode: false,
};

export const mockToolApproval = {
  toolApprovalMode: true,
  setToolApprovalMode: vi.fn(),
  pendingApprovalTools: [],
  pendingApprovalBatchTotal: 0,
  sessionApprovedTools: new Set<string>(),
  addSessionApprovedTool: vi.fn(),
  clearSessionApprovedTools: vi.fn(),
  handleSingleToolApproval: vi.fn(),
};

export const mockStdoutDimensions = {
  cols: 80,
  rows: 24,
};

export const mockUseFocus = {
  id: 'mock-id',
  isFocused: false,
  focus: vi.fn(),
  clearFocus: vi.fn(),
};

export const mockUseInput = vi.fn();
export const mockUseMouse = vi.fn();

export function createThemeMock(overrides?: any) {
  return () => ({
    theme: overrides ? { ...mockTheme, ...overrides } : mockTheme,
    getColor: vi.fn((path: string) => 'white'),
  });
}

export function createAltModeMock(overrides?: any) {
  return () => ({ ...mockAltMode, ...overrides });
}

export function createToolApprovalMock(overrides?: any) {
  return () => ({ ...mockToolApproval, ...overrides });
}

export function createStdoutDimensionsMock(overrides?: any) {
  return () => ({ ...mockStdoutDimensions, ...overrides });
}

export function createUseFocusMock(overrides?: any) {
  return () => ({ ...mockUseFocus, ...overrides });
}

// ============================================================================
// Module-level mock setup
// These vi.mock() calls are hoisted to the top of the module automatically
// ============================================================================

// Mocks are intentionally left commented out - they're defined below for @ aliases

// ============================================================================
// Module-level mock setup for @ alias imports
// These are needed for components that use @/ path imports
// Mock implementations are inlined to avoid hoisting issues with function calls
// ============================================================================

// ThemeContext is not mocked - use the real implementation with ThemeProvider in tests

vi.mock('@/contexts/AltModeContext', () => ({
  useAltMode: () => mockAltMode,
}));

vi.mock('@/contexts/ToolApprovalContext.js', () => ({
  useToolApproval: () => mockToolApproval,
}));

vi.mock('@/contexts/ConfigContext.js', () => ({
  useConfig: vi.fn().mockReturnValue({
    get: vi.fn((key: string) => {
      if (key === 'thinking') return 'off';
      if (key === 'activeProvider') return 'openai';
      if (key === 'model') return 'gpt-4';
      return undefined;
    }),
    getCurrentProfile: vi.fn().mockReturnValue('default'),
    set: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@/contexts/StdoutDimensionsContext', () => ({
  useStdoutDimensionsContext: () => mockStdoutDimensions,
}));

vi.mock('@/contexts/InputContext/index.js', () => ({
  useFocus: () => mockUseFocus,
  useInput: mockUseInput,
  useMouse: mockUseMouse,
}));

vi.mock('@/contexts/UserQuestionContext.js', () => ({
  useUserQuestion: vi.fn().mockReturnValue({
    pendingQuestion: null,
    handleQuestionResponse: vi.fn(),
  }),
}));

export function setupContextMocks() {
  // Legacy function kept for backwards compatibility
  // The mocks are now set up at module level above
}

export function setupContextMocksWithOverrides(_options?: {
  theme?: any;
  altMode?: any;
  toolApproval?: any;
  stdoutDimensions?: any;
  focus?: any;
  config?: Record<string, any>;
  userQuestion?: { pendingQuestion?: any };
}) {
  // Note: vi.mock is hoisted so we can't dynamically configure mocks with options.
  // Instead, call setupContextMocks() first, then override specific mocks in your tests.
  // Example:
  //   setupContextMocks();
  //   beforeEach(async () => {
  //     const themeModule = await import('../source/contexts/ThemeContext.js');
  //     vi.mocked(themeModule.useTheme).mockReturnValue({ theme: customTheme });
  //   });
  setupContextMocks();
}
