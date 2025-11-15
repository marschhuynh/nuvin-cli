import chalk from 'chalk';
import { highlight as highlightCli } from 'cli-highlight';
import type { HighlightOptions, StyleFunction } from './renderer-types.js';
import { fixHardReturn } from './text-utils.js';

export function highlight(
	code: string,
	language: string | undefined,
	styleFunc: StyleFunction,
	reflowText: boolean,
	highlightOpts: HighlightOptions,
): string {
	if (chalk.level === 0) return code;

	code = fixHardReturn(code, reflowText);

	try {
		return highlightCli(code, Object.assign({}, { language }, highlightOpts));
	} catch (_e) {
		return styleFunc(code);
	}
}
