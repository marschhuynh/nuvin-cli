export function unwrapMarkdownBlocks(text: string) {
  const lines = text.split('\n');
  const result = [];
  const stack = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check if this line contains only backticks (potential delimiter)
    const backtickMatch = line.match(/^(\s*)(```+)(.*)$/);

    if (backtickMatch) {
      const indent = backtickMatch[1];
      const backticks = backtickMatch[2];
      const language = backtickMatch[3].trim();

      // Check if this looks like table content rather than a code block
      const isTableContext = isInTableContext(lines, i);

      if (isTableContext) {
        // Treat as regular content, not a code block delimiter
        result.push(line);
        continue;
      }

      // Check if we're closing a block
      if (stack.length > 0) {
        const lastBlock = stack[stack.length - 1];
        if (backticks.length === lastBlock.backtickCount &&
            indent === lastBlock.indent &&
            language === '') {
          // This closes the current block
          const closedBlock = stack.pop();

          // Only skip the line if it's closing a markdown block
          if (closedBlock.language !== 'markdown') {
            result.push(line);
          }
          continue;
        }
      }

      // This opens a new block
      const blockInfo: any = {
        backtickCount: backticks.length,
        language: language,
        indent: indent,
        startLine: i
      };

      stack.push(blockInfo);

      // Only skip the line if it's opening a markdown block
      if (language !== 'markdown') {
        result.push(line);
      }
    } else {
      // Regular content line
      result.push(line);
    }
  }

  return result.join('\n');
}

/**
 * Check if a line with backticks is likely part of a table rather than a code block delimiter
 */
function isInTableContext(lines: string[], lineIndex: number) {
  const checkRange = 2; // Look 2 lines before and after
  const start = Math.max(0, lineIndex - checkRange);
  const end = Math.min(lines.length - 1, lineIndex + checkRange);

  // Look for table indicators (lines with | characters) nearby
  for (let i = start; i <= end; i++) {
    if (i !== lineIndex && lines[i].includes('|')) {
      return true;
    }
  }

  return false;
}
