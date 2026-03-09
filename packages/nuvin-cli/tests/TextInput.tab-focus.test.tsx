import React from 'react';
import {describe, it, expect, vi, beforeEach} from 'vitest';
import {render} from '../../ink/build/index.js';
import createStdout from '../../ink/test/helpers/create-stdout.js';
import TextInput from '../source/components/TextInput/index.js';

const {mockUseInput} = vi.hoisted(() => ({
	mockUseInput: vi.fn(),
}));

vi.mock('../source/contexts/InputContext/index.js', () => ({
	useInput: mockUseInput,
}));

function getRegisteredHandler() {
	const latestCall = mockUseInput.mock.calls.at(-1);
	if (!latestCall) {
		throw new Error('Expected useInput to register a handler');
	}

	return latestCall[0] as (input: string, key: Record<string, boolean>) => boolean | void;
}

function createTabKey(overrides: Partial<Record<string, boolean>> = {}) {
	return {
		upArrow: false,
		downArrow: false,
		leftArrow: false,
		rightArrow: false,
		pageDown: false,
		pageUp: false,
		home: false,
		end: false,
		return: false,
		escape: false,
		ctrl: false,
		shift: false,
		tab: true,
		backspace: false,
		delete: false,
		meta: false,
		...overrides,
	};
}

describe('TextInput tab handling', () => {
	beforeEach(() => {
		mockUseInput.mockReset();
	});

	it('does not consume tab when onTab makes no change', () => {
		const stdout = createStdout(100);
		const onChange = vi.fn();
		const onTab = vi.fn(() => undefined);

		const instance = render(
			<TextInput
				value="hello"
				onChange={onChange}
				onTab={onTab}
			/>,
			{stdout, debug: true},
		);

		const handler = getRegisteredHandler();
		const result = handler('\t', createTabKey());

		expect(onTab).toHaveBeenCalledWith('hello', 5, false);
		expect(result).toBeUndefined();

		instance.unmount();
	});

	it('consumes tab when onTab applies a completion', () => {
		const stdout = createStdout(100);
		const onChange = vi.fn();
		const onTab = vi.fn(() => ({value: '/help', cursorOffset: 5}));

		const instance = render(
			<TextInput
				value="/he"
				onChange={onChange}
				onTab={onTab}
			/>,
			{stdout, debug: true},
		);

		const handler = getRegisteredHandler();
		const result = handler('\t', createTabKey());

		expect(onTab).toHaveBeenCalledWith('/he', 3, false);
		expect(result).toBe(true);

		instance.unmount();
	});
});
