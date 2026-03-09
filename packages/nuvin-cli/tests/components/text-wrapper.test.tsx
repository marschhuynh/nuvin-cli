import { render } from 'ink-testing-library';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { measureElement } from 'ink';
import { TextWrapper } from '../../source/components/TextWrapper.js';

vi.mock('ink', async () => {
  const actual = await vi.importActual<typeof import('ink')>('ink');
  return {
    ...actual,
    measureElement: vi.fn(),
  };
});

vi.mock('@/hooks/useStdoutDimensions.js', () => ({
  useStdoutDimensions: () => ({ cols: 10, rows: 24 }),
}));

describe('TextWrapper', () => {
  beforeEach(() => {
    vi.mocked(measureElement).mockReturnValue({ width: 0, height: 1 } as never);
  });

  it('wraps using stdout columns when container width unavailable', () => {
    const { lastFrame } = render(<TextWrapper>alpha beta gamma</TextWrapper>);

    expect(lastFrame()?.trimEnd()).toBe('alpha\nbeta\ngamma');
  });

  it('does not indent wrapped lines by default', () => {
    const { lastFrame } = render(
      <TextWrapper>MCP server 'atlassian' requires authentication. Run: nuvin mcp login atlassian</TextWrapper>,
    );

    const lines = (lastFrame() ?? '').trimEnd().split('\n');
    expect(lines.some((line) => line.startsWith(' '))).toBe(false);
  });
});
