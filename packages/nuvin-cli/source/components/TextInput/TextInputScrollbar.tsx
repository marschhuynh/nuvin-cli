import { Box, Text } from 'ink';

export type ScrollbarProps = {
  scrollRatio: number;
  visibleRatio: number;
  height: number;
  color?: string;
  trackColor?: string;
};

export function TextInputScrollbar({
  scrollRatio,
  visibleRatio,
  height,
  color = 'cyan',
  trackColor = 'gray',
}: ScrollbarProps) {
  if (visibleRatio >= 1 || height <= 0) {
    return null;
  }

  const thumbHeight = Math.max(1, Math.round(visibleRatio * height));
  const maxThumbPos = height - thumbHeight;
  const thumbPosition = Math.round(scrollRatio * maxThumbPos);

  const track: string[] = [];
  for (let i = 0; i < height; i++) {
    if (i >= thumbPosition && i < thumbPosition + thumbHeight) {
      track.push('┃');
    } else {
      track.push('│');
    }
  }

  return (
    <Box flexDirection="column" flexShrink={0} marginLeft={1}>
      {track.map((char, i) => (
        <Text key={`scrollbar-${i}`} color={char === '┃' ? color : trackColor}>
          {char}
        </Text>
      ))}
    </Box>
  );
}
