import CliTable3 from 'cli-table3';
import stringWidth from 'string-width';
import { escapeRegExp, identity } from './text-utils.js';

export const TABLE_CELL_SPLIT = '^*||*^';
export const TABLE_ROW_WRAP = '*|*|*|*';
export const TABLE_ROW_WRAP_REGEXP = new RegExp(escapeRegExp(TABLE_ROW_WRAP), 'g');

export function generateTableRow(text: string, escapeFunc?: (text: string) => string): string[][] {
  if (!text) return [];
  const escaper = escapeFunc || identity;
  const lines = escaper(text).split('\n');

  const data: string[][] = [];
  lines.forEach((line) => {
    if (!line) return;
    const parsed = line.replace(TABLE_ROW_WRAP_REGEXP, '').split(TABLE_CELL_SPLIT);
    data.push(parsed.splice(0, parsed.length - 1));
  });
  return data;
}

/**
 * Calculate optimal column widths based on content and available width
 */
function calculateColumnWidths(headerRow: string[], bodyRows: string[][], maxWidth: number): number[] | undefined {
  if (!headerRow || headerRow.length === 0) return undefined;

  const numCols = headerRow.length;
  // Account for borders: | col | col | = 1 + 3*(numCols) = 1 + 3n
  // Each column has: | content | = 3 chars overhead (| + space + |)
  // Actually cli-table3 uses: │ content │ content │ = 1 + (content + 3) * numCols
  const borderOverhead = 1 + numCols * 3;
  const availableWidth = Math.max(maxWidth - borderOverhead, numCols * 5); // min 5 chars per column

  // Calculate max content width for each column
  const maxColWidths: number[] = [];
  for (let i = 0; i < numCols; i++) {
    let maxW = stringWidth(headerRow[i] || '');
    for (const row of bodyRows) {
      if (row[i]) {
        maxW = Math.max(maxW, stringWidth(row[i]));
      }
    }
    maxColWidths.push(maxW);
  }

  const totalContentWidth = maxColWidths.reduce((a, b) => a + b, 0);

  // If content fits, don't constrain
  if (totalContentWidth <= availableWidth) {
    return undefined;
  }

  // Distribute width proportionally, with a minimum of 5 chars per column
  const minColWidth = 5;
  const colWidths: number[] = [];
  let remaining = availableWidth;

  for (let i = 0; i < numCols; i++) {
    const proportion = maxColWidths[i] / totalContentWidth;
    let width = Math.max(Math.floor(proportion * availableWidth), minColWidth);
    // Ensure we don't exceed remaining space
    if (i === numCols - 1) {
      width = Math.max(remaining, minColWidth);
    } else {
      remaining -= width;
    }
    colWidths.push(width);
  }

  return colWidths;
}

export function createTable(
  header: string,
  body: string,
  tableSettings: Record<string, unknown>,
  transform: (text: string) => string,
  tableStyle: (text: string) => string,
  maxWidth?: number,
): string {
  const headerRow = generateTableRow(header)[0] || [];
  const bodyRows = generateTableRow(body || '', transform);

  // Calculate column widths if maxWidth is provided
  const colWidths = maxWidth ? calculateColumnWidths(headerRow, bodyRows, maxWidth) : undefined;

  const tableOptions: CliTable3.TableConstructorOptions = {
    head: headerRow,
    wordWrap: true,
    wrapOnWordBoundary: true,
    ...tableSettings,
  };

  // Only set colWidths if we need to constrain the table
  if (colWidths) {
    tableOptions.colWidths = colWidths;
  }

  const table = new CliTable3(tableOptions);

  bodyRows.forEach((row) => {
    table.push(row);
  });
  return tableStyle(table.toString());
}
