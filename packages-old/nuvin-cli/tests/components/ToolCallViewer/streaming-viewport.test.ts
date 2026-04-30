import { describe, it, expect } from 'vitest';
import { buildStreamingViewportLines } from '@/components/ToolCallViewer/streamingViewport.js';

describe('buildStreamingViewportLines', () => {
  it('always returns a fixed viewport size', () => {
    const lines = buildStreamingViewportLines('line1', 5);
    expect(lines).toHaveLength(5);
  });

  it('pads short output with blank lines at the top', () => {
    const lines = buildStreamingViewportLines('line1\nline2', 5);
    expect(lines).toEqual([' ', ' ', ' ', 'line1', 'line2']);
  });

  it('keeps only the latest lines when output exceeds viewport', () => {
    const lines = buildStreamingViewportLines('1\n2\n3\n4\n5\n6', 5);
    expect(lines).toEqual(['2', '3', '4', '5', '6']);
  });

  it('preserves intentional empty lines inside the viewport', () => {
    const lines = buildStreamingViewportLines('line1\n\nline3', 5);
    expect(lines).toEqual([' ', ' ', 'line1', ' ', 'line3']);
  });
});
