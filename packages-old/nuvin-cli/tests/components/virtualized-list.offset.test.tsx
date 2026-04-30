import React from 'react';
import {Box, Text} from 'ink';
import {describe, expect, it} from 'vitest';
import {render} from 'ink';
import {VirtualizedList} from '../../source/components/VirtualizedList.js';
import {InputContext} from '../../source/contexts/InputContext/InputContext.js';
import {FocusProvider} from '../../source/contexts/InputContext/FocusContext.js';
import type {
	InputContextValue,
	InputHandler,
	Key,
	MouseHandler,
	UseInputOptions,
	UseMouseOptions,
} from '../../source/contexts/InputContext/types.js';
import { createStdout } from '../testUtils/index.js';

type Item = {
	id: string;
	lines: string[];
};

type SubscriberRecord<THandler> = {
	handler: THandler;
	options: {isActive?: boolean; priority?: number};
};

function delay(ms = 50): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

function getVisibleLines(frame: string): string[] {
	return frame
		.split('\n')
		.map(line => line.replace(/[│┃]/g, '').trimEnd())
		.filter(Boolean);
}

function createInputHarness() {
	let nextId = 0;
	const inputSubscribers = new Map<number, SubscriberRecord<InputHandler>>();
	const mouseSubscribers = new Map<number, SubscriberRecord<MouseHandler>>();

	const subscribeFactory =
		<THandler, TOptions extends UseInputOptions | UseMouseOptions>(
			store: Map<number, SubscriberRecord<THandler>>,
		) =>
		(handler: THandler, options: TOptions = {} as TOptions) => {
			const id = ++nextId;
			store.set(id, {handler, options});
			return () => {
				store.delete(id);
			};
		};

	const contextValue: InputContextValue = {
		subscribe: subscribeFactory(inputSubscribers),
		subscribeMouse: subscribeFactory(mouseSubscribers),
		updateSubscriber: () => {},
		addMiddleware: () => () => {},
		setRawMode: () => {},
		isRawModeSupported: false,
		enableMouseMode: () => {},
		disableMouseMode: () => {},
		isMouseModeEnabled: false,
	};

	const dispatchInput = (input: string, key: Partial<Key> = {}) => {
		const resolvedKey: Key = {
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
			tab: false,
			backspace: false,
			delete: false,
			meta: false,
			...key,
		};

		const subscribers = [...inputSubscribers.values()]
			.filter(subscriber => subscriber.options.isActive !== false)
			.sort((a, b) => (b.options.priority ?? 0) - (a.options.priority ?? 0));

		for (const subscriber of subscribers) {
			if (subscriber.handler(input, resolvedKey) === true) {
				return true;
			}
		}

		return false;
	};

	return {contextValue, dispatchInput};
}

function renderVirtualizedList(items: Item[], options?: {showScrollbar?: boolean}) {
	const stdout = createStdout(100);
	const inputHarness = createInputHarness();

	const instance = render(
		<InputContext.Provider value={inputHarness.contextValue}>
			<FocusProvider>
				<VirtualizedList
					items={items}
					renderItem={item => (
						<Box flexDirection="column" flexShrink={0}>
							{item.lines.map(line => (
								<Text key={line}>{line}</Text>
							))}
						</Box>
					)}
					keyExtractor={item => item.id}
					height={3}
					overscan={0}
					scrollStep={1}
					showScrollbar={options?.showScrollbar ?? true}
					focus
				/>
			</FocusProvider>
		</InputContext.Provider>,
		{stdout, debug: true},
	);

	return {instance, stdout, dispatchInput: inputHarness.dispatchInput};
}

describe('VirtualizedList offset calculations', () => {
	it('starts at the exact bottom boundary offset when auto-scroll is enabled', async () => {
		const items: Item[] = [
			{id: 'a', lines: ['A1', 'A2']},
			{id: 'b', lines: ['B1']},
			{id: 'c', lines: ['C1']},
			{id: 'd', lines: ['D1']},
		];

		const {instance, stdout} = renderVirtualizedList(items);

		await delay();

		expect(getVisibleLines(stdout.get())).toEqual(['B1', 'C1', 'D1']);
		instance.unmount();
	});

	it('moves the viewport by one line when scrolling upward into a tall item', async () => {
		const items: Item[] = [
			{id: 'a', lines: ['A1', 'A2']},
			{id: 'b', lines: ['B1']},
			{id: 'c', lines: ['C1']},
			{id: 'd', lines: ['D1']},
		];

		const {instance, stdout, dispatchInput} = renderVirtualizedList(items);

		await delay();
		expect(dispatchInput('k')).toBe(true);
		await delay();

		expect(getVisibleLines(stdout.get())).toEqual(['A2', 'B1', 'C1']);
		instance.unmount();
	});

	it('places the first item at the top when scrolling to the exact top boundary', async () => {
		const items: Item[] = [
			{id: 'a', lines: ['A1', 'A2']},
			{id: 'b', lines: ['B1']},
			{id: 'c', lines: ['C1']},
			{id: 'd', lines: ['D1']},
		];

		const {instance, stdout, dispatchInput} = renderVirtualizedList(items);

		await delay();
		expect(dispatchInput('k')).toBe(true);
		await delay();
		expect(dispatchInput('k')).toBe(true);
		await delay();

		expect(getVisibleLines(stdout.get())).toEqual(['A1', 'A2', 'B1']);
		instance.unmount();
	});

	it('still allows keyboard scrolling when the scrollbar is hidden', async () => {
		const items: Item[] = [
			{id: 'a', lines: ['A1', 'A2']},
			{id: 'b', lines: ['B1']},
			{id: 'c', lines: ['C1']},
			{id: 'd', lines: ['D1']},
		];

		const {instance, stdout, dispatchInput} = renderVirtualizedList(items, {showScrollbar: false});

		await delay(100);
		expect(getVisibleLines(stdout.get())).toEqual(['B1', 'C1', 'D1']);
		expect(dispatchInput('k')).toBe(true);
		await delay();

		expect(getVisibleLines(stdout.get())).toEqual(['A2', 'B1', 'C1']);
		instance.unmount();
	});
});
