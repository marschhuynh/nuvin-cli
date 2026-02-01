import { vi } from 'vitest';

/**
 * Mock all contexts and hooks used by ToolCallViewer
 */
export function setupToolCallViewerMocks() {
  // Mock dimensions
  vi.mock('@/hooks/useStdoutDimensions.ts', () => ({
    useStdoutDimensions: vi.fn().mockReturnValue({ cols: 100, rows: 30 }),
  }));

  // Mock theme
  vi.mock('@/contexts/ThemeContext.js', () => ({
    useTheme: vi.fn().mockReturnValue({
      theme: {
        messageTypes: { tool: 'blue' },
        status: { success: 'green', error: 'red', idle: 'yellow', warning: 'yellow' },
        colors: { warning: 'yellow', muted: 'gray', textDim: 'gray' },
        tokens: { gray: 'gray', red: 'red' },
      },
    }),
  }));

  // Mock tool approval
  vi.mock('@/contexts/ToolApprovalContext.js', () => ({
    useToolApproval: vi.fn().mockReturnValue({ pendingApprovalTools: [] }),
  }));
}
