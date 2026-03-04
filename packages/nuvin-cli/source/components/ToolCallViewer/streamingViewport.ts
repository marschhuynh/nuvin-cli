export function buildStreamingViewportLines(content: string, viewportLines = 5): string[] {
  const rawLines = content.split('\n');
  const latestLines = rawLines.slice(-viewportLines).map((line) => (line === '' ? ' ' : line));

  if (latestLines.length >= viewportLines) {
    return latestLines;
  }

  const padCount = viewportLines - latestLines.length;
  const padding = Array.from({ length: padCount }, () => ' ');
  return [...padding, ...latestLines];
}
