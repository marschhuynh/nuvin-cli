import CliTable3 from 'cli-table3';
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

export function createTable(
	header: string,
	body: string,
	tableSettings: Record<string, unknown>,
	transform: (text: string) => string,
	tableStyle: (text: string) => string,
): string {
	const table = new CliTable3(
		Object.assign(
			{},
			{
				head: generateTableRow(header)[0],
			},
			tableSettings,
		),
	);

	generateTableRow(body || '', transform).forEach((row) => {
		table.push(row);
	});
	return tableStyle(table.toString());
}
