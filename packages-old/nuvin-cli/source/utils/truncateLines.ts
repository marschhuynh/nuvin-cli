import stringWidth from 'string-width';

export function truncateLines(
  content: string,
  maxHeight: number,
  width: number,
): { text: string; truncated: boolean; totalLines: number } {
  if (maxHeight <= 0) {
    return { text: '', truncated: content.length > 0, totalLines: content.split('\n').length };
  }

  const lines = content.split('\n');
  const totalLines = lines.length;

  const lineHeights: number[] = lines.map((line) => {
    const lineWidth = stringWidth(line);
    return lineWidth === 0 ? 1 : Math.ceil(lineWidth / width);
  });

  const totalHeight = lineHeights.reduce((sum, h) => sum + h, 0);

  if (totalHeight <= maxHeight) {
    return { text: content, truncated: false, totalLines };
  }

  const outputLines: string[] = [];
  let currentHeight = 0;

  for (let i = lines.length - 1; i >= 0; i--) {
    const lineHeight = lineHeights[i];

    if (currentHeight + lineHeight <= maxHeight) {
      outputLines.unshift(lines[i]);
      currentHeight += lineHeight;
    } else {
      const remainingHeight = maxHeight - currentHeight;
      if (remainingHeight > 0) {
        const truncatedLine = truncateFromEnd(lines[i], remainingHeight * width);
        if (truncatedLine) {
          outputLines.unshift(truncatedLine);
        }
      }
      break;
    }
  }

  return { text: outputLines.join('\n'), truncated: true, totalLines };
}

function truncateFromEnd(text: string, maxWidth: number): string {
  const chars = [...text];
  let currentWidth = 0;
  let startIndex = chars.length;

  for (let i = chars.length - 1; i >= 0; i--) {
    const charWidth = stringWidth(chars[i]);
    if (currentWidth + charWidth > maxWidth) {
      break;
    }
    currentWidth += charWidth;
    startIndex = i;
  }

  return chars.slice(startIndex).join('');
}
