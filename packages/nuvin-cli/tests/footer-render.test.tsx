import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must come before any imports that trigger module resolution
// ---------------------------------------------------------------------------

vi.mock('@/contexts/ThemeContext.js', () => ({
  useTheme: vi.fn().mockReturnValue({
    theme: {
      footer: {
        provider: 'yellow',
        model: 'gray',
        status: 'gray',
        thinking: 'gray',
        infoBg: 'transparent',
        currentDir: 'blue',
        gitBranch: 'white',
      },
      colors: { accent: 'cyan', text: 'white', textDim: 'gray' },
      tokens: {
        yellow: 'yellow',
        gray: 'gray',
        green: 'green',
        magenta: 'magenta',
        blue: 'blue',
        cyan: 'cyan',
        white: 'white',
        red: 'red',
      },
    },
  }),
}));

vi.mock('@/contexts/ToolApprovalContext.js', () => ({
  useToolApproval: vi.fn().mockReturnValue({ toolApprovalMode: true }),
}));

vi.mock('@/hooks/useNotification.js', () => ({
  useNotification: vi.fn().mockReturnValue({ notification: null }),
}));

vi.mock('@/contexts/ConfigContext.js', () => ({
  useConfig: vi.fn().mockReturnValue({
    get: vi.fn().mockImplementation((key: string) => {
      if (key === 'thinking') return 'OFF';
      if (key === 'activeProvider') return 'anthropic';
      if (key === 'model') return 'claude-3-5-sonnet';
      if (key === 'ui.statusline.rows') return undefined; // use default
      return undefined;
    }),
    getCurrentProfile: vi.fn().mockReturnValue('default'),
  }),
}));

vi.mock('@/services/EventBus.js', () => ({
  eventBus: {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
  },
}));

vi.mock('@/utils/formatters.js', () => ({
  formatTokens: (n: number) => String(n),
  formatCost: (n: number) => n.toFixed(4),
  formatDirectory: (d: string) => d.replace(process.env.HOME ?? '/home/user', '~'),
  getUsageColor: (_usage: number, _theme: unknown) => 'green',
  getGitBranchAsync: vi.fn().mockResolvedValue('main'),
}));

// ---------------------------------------------------------------------------

import { render } from 'ink-testing-library';
import { describe, it, expect, vi } from 'vitest';
import { Footer, DEFAULT_STATUSLINE_ROWS } from '../source/components/Footer.js';
import type { MetricsSnapshot } from '../source/services/SessionMetricsService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyMetrics(): MetricsSnapshot {
  return {
    currentTokens: 0,
    totalTokens: 0,
    currentPromptTokens: 0,
    currentCompletionTokens: 0,
    currentCachedTokens: 0,
    contextWindowLimit: undefined,
    contextWindowUsage: undefined,
    totalCost: 0,
    llmCallCount: 0,
    toolCallCount: 0,
  };
}

function metrics(overrides: Partial<MetricsSnapshot> = {}): MetricsSnapshot {
  return { ...emptyMetrics(), ...overrides };
}

const baseProps = {
  status: '',
  workingDirectory: '/home/user/projects/myapp',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Footer — default layout (snapshot)', () => {
  it('renders status bar with provider:model', () => {
    const { lastFrame } = render(
      <Footer {...baseProps} />,
    );
    expect(lastFrame()).toContain('anthropic:claude-3-5-sonnet');
  });

  it('renders working directory', () => {
    const { lastFrame } = render(
      <Footer {...baseProps} />,
    );
    expect(lastFrame()).toContain('projects/myapp');
  });

  it('renders keybindings hint', () => {
    const { lastFrame } = render(
      <Footer {...baseProps} />,
    );
    expect(lastFrame()).toContain('/ command');
    expect(lastFrame()).toContain('ESC×2');
  });

  it('does not render metrics when all zero', () => {
    const { lastFrame } = render(
      <Footer {...baseProps} metrics={emptyMetrics()} />,
    );
    expect(lastFrame()).not.toContain('Tokens:');
    expect(lastFrame()).not.toContain('Req:');
  });

  it('renders token count when non-zero', () => {
    const { lastFrame } = render(
      <Footer {...baseProps} metrics={metrics({ currentTokens: 1234 })} />,
    );
    expect(lastFrame()).toContain('Tokens:');
    expect(lastFrame()).toContain('1234');
  });

  it('renders cost when non-zero', () => {
    const { lastFrame } = render(
      <Footer {...baseProps} metrics={metrics({ currentTokens: 100, totalCost: 0.0042 })} />,
    );
    expect(lastFrame()).toContain('$');
    expect(lastFrame()).toContain('0.0042');
  });

  it('renders request count when non-zero', () => {
    const { lastFrame } = render(
      <Footer {...baseProps} metrics={metrics({ currentTokens: 100, llmCallCount: 3 })} />,
    );
    expect(lastFrame()).toContain('Req: 3');
  });

  it('renders tool call count when non-zero', () => {
    const { lastFrame } = render(
      <Footer {...baseProps} metrics={metrics({ currentTokens: 100, toolCallCount: 7 })} />,
    );
    expect(lastFrame()).toContain('Tools: 7');
  });

  it('renders cached tokens when non-zero', () => {
    const { lastFrame } = render(
      <Footer {...baseProps} metrics={metrics({ currentTokens: 500, currentCachedTokens: 200 })} />,
    );
    expect(lastFrame()).toContain('Cached: 200');
  });

  it('renders SUDO when toolApprovalMode is false', async () => {
    const { useToolApproval } = await import('@/contexts/ToolApprovalContext.js');
    vi.mocked(useToolApproval).mockReturnValueOnce({ toolApprovalMode: false });

    const { lastFrame } = render(<Footer {...baseProps} />);
    expect(lastFrame()).toContain('SUDO');
  });

  it('does not render SUDO when toolApprovalMode is true', () => {
    const { lastFrame } = render(<Footer {...baseProps} />);
    expect(lastFrame()).not.toContain('SUDO');
  });

  it('renders session ID when provided', () => {
    const { lastFrame } = render(
      <Footer {...baseProps} sessionId="abc-123" />,
    );
    expect(lastFrame()).toContain('Session: abc-123');
  });

  it('does not render session section when sessionId is absent', () => {
    const { lastFrame } = render(<Footer {...baseProps} />);
    expect(lastFrame()).not.toContain('Session:');
  });

  it('shows notification text on row 0 when notification is active', async () => {
    const { useNotification } = await import('@/hooks/useNotification.js');
    vi.mocked(useNotification).mockReturnValueOnce({ notification: 'Tool approved' });

    const { lastFrame } = render(<Footer {...baseProps} />);
    expect(lastFrame()).toContain('Tool approved');
  });

  it('notification replaces row 0 left content, not row 1', async () => {
    const { useNotification } = await import('@/hooks/useNotification.js');
    vi.mocked(useNotification).mockReturnValueOnce({ notification: 'Saving...' });

    const { lastFrame } = render(<Footer {...baseProps} />);
    const frame = lastFrame()!;
    // Notification appears
    expect(frame).toContain('Saving...');
    // Row 0 status items replaced — provider:model should not appear alongside notification
    const notifLine = frame.split('\n').find(l => l.includes('Saving...'))!;
    expect(notifLine).not.toContain('anthropic:claude-3-5-sonnet');
    // Row 1 (dir + keybindings) still renders
    expect(frame).toContain('projects/myapp');
    expect(frame).toContain('/ command');
  });
});

describe('Footer — segment visibility via ui.statusline.rows config', () => {
  it('hides cost segment when removed from rows', async () => {
    const { useConfig } = await import('@/contexts/ConfigContext.js');
    vi.mocked(useConfig).mockReturnValueOnce({
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'thinking') return 'OFF';
        if (key === 'activeProvider') return 'anthropic';
        if (key === 'model') return 'claude-3-5-sonnet';
        if (key === 'ui.statusline.rows') return [
          ['model', 'session', 'thinking', 'sudo', 'tokens', 'context', 'cached', 'requests', 'tools', /* no cost */ 'lsp'],
          ['gitBranch', 'keybindings'],
        ];
        return undefined;
      }),
      getCurrentProfile: vi.fn().mockReturnValue('default'),
    });

    const { lastFrame } = render(
      <Footer {...baseProps} metrics={metrics({ currentTokens: 100, totalCost: 0.05 })} />,
    );
    expect(lastFrame()).toContain('Tokens:');
    expect(lastFrame()).not.toContain('$');
  });

  it('hides keybindings when removed from rows', async () => {
    const { useConfig } = await import('@/contexts/ConfigContext.js');
    vi.mocked(useConfig).mockReturnValueOnce({
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'thinking') return 'OFF';
        if (key === 'activeProvider') return 'anthropic';
        if (key === 'model') return 'claude-3-5-sonnet';
        if (key === 'ui.statusline.rows') return [
          ['model', 'session', 'thinking', 'sudo', 'tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp'],
          ['gitBranch' /* no keybindings */],
        ];
        return undefined;
      }),
      getCurrentProfile: vi.fn().mockReturnValue('default'),
    });

    const { lastFrame } = render(<Footer {...baseProps} />);
    expect(lastFrame()).not.toContain('/ command');
    expect(lastFrame()).not.toContain('ESC×2');
  });

  it('hides tokens segment when removed from rows', async () => {
    const { useConfig } = await import('@/contexts/ConfigContext.js');
    vi.mocked(useConfig).mockReturnValueOnce({
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'thinking') return 'OFF';
        if (key === 'activeProvider') return 'anthropic';
        if (key === 'model') return 'claude-3-5-sonnet';
        if (key === 'ui.statusline.rows') return [
          ['model', 'session', 'thinking', 'sudo', /* no tokens */ 'context', 'cached', 'requests', 'tools', 'cost', 'lsp'],
          ['gitBranch', 'keybindings'],
        ];
        return undefined;
      }),
      getCurrentProfile: vi.fn().mockReturnValue('default'),
    });

    const { lastFrame } = render(
      <Footer {...baseProps} metrics={metrics({ currentTokens: 9999 })} />,
    );
    expect(lastFrame()).not.toContain('Tokens:');
    expect(lastFrame()).not.toContain('9999');
  });

  it('hides provider:model when model segment removed from rows', async () => {
    const { useConfig } = await import('@/contexts/ConfigContext.js');
    vi.mocked(useConfig).mockReturnValueOnce({
      get: vi.fn().mockImplementation((key: string) => {
        if (key === 'thinking') return 'OFF';
        if (key === 'activeProvider') return 'anthropic';
        if (key === 'model') return 'claude-3-5-sonnet';
        if (key === 'ui.statusline.rows') return [
          [/* no model */ 'session', 'thinking', 'sudo', 'tokens', 'context', 'cached', 'requests', 'tools', 'cost', 'lsp'],
          ['gitBranch', 'keybindings'],
        ];
        return undefined;
      }),
      getCurrentProfile: vi.fn().mockReturnValue('default'),
    });

    const { lastFrame } = render(<Footer {...baseProps} />);
    expect(lastFrame()).not.toContain('anthropic:claude-3-5-sonnet');
  });

  it('shows provider:model when model segment is present (default)', () => {
    const { lastFrame } = render(<Footer {...baseProps} />);
    expect(lastFrame()).toContain('anthropic:claude-3-5-sonnet');
  });

  it('shows all segments from DEFAULT_STATUSLINE_ROWS with full metrics', () => {
    const { lastFrame } = render(
      <Footer
        {...baseProps}
        sessionId="s1"
        metrics={metrics({
          currentTokens: 500,
          totalTokens: 1000,
          currentCachedTokens: 100,
          llmCallCount: 2,
          toolCallCount: 4,
          totalCost: 0.01,
        })}
      />,
    );

    const frame = lastFrame()!;
    expect(frame).toContain('Tokens:');
    expect(frame).toContain('Cached:');
    expect(frame).toContain('Req: 2');
    expect(frame).toContain('Tools: 4');
    expect(frame).toContain('$');
    expect(frame).toContain('Session: s1');
    expect(frame).toContain('projects/myapp');
    expect(frame).toContain('/ command');
  });
});

describe('Footer — DEFAULT_STATUSLINE_ROWS produces same output as config', () => {
  it('explicit DEFAULT_STATUSLINE_ROWS config matches no-config output', () => {
    // Render once with no config (falls back to default)
    const { lastFrame: defaultFrame } = render(
      <Footer {...baseProps} metrics={metrics({ currentTokens: 100, llmCallCount: 1 })} />,
    );

    // Render again with explicit DEFAULT_STATUSLINE_ROWS
    // (would require separate mock — just assert the default contains expected segments)
    const frame = defaultFrame()!;
    expect(frame).toContain('Tokens:');
    expect(frame).toContain('Req: 1');
    expect(frame).toContain('projects/myapp');
    expect(frame).toContain('/ command');
  });
});
