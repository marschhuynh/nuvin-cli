import * as emoji from 'node-emoji';
import { escapeRegExp } from './text-utils.js';

export const COLON_REPLACER = '*#COLON|*';
export const COLON_REPLACER_REGEXP = new RegExp(escapeRegExp(COLON_REPLACER), 'g');

export function insertEmojis(text: string): string {
	return text.replace(/:([A-Za-z0-9_\-+]+?):/g, (emojiString) => {
		const emojiSign = emoji.get(emojiString);
		if (!emojiSign) return emojiString;
		return `${emojiSign} `;
	});
}

export function undoColon(str: string): string {
	return str.replace(COLON_REPLACER_REGEXP, ':');
}
