# `@nuvin/ink-virtualized-list`

Shared virtualization primitive for terminal UIs built on `@nuvin/ink`.

## Contents

- [Component](#component)
  - [`<VirtualizedList>`](#virtualizedlist)

## Component

### `<VirtualizedList>`

`VirtualizedList` is a keyboard-first, self-contained viewport for large terminal lists. It measures its own container, renders only the visible slice plus overscan, supports variable-height items through measurement and cached heights, and includes a built-in scrollbar column by default.

```tsx
import React from 'react';
import {Box, Text} from '@nuvin/ink';
import {VirtualizedList} from '@nuvin/ink-virtualized-list';

const items = Array.from({length: 200}, (_, index) => ({
	id: `item-${index}`,
	label: `Row ${index}: A long line that may wrap based on width`,
}));

export function Example() {
	return (
		<Box height={8}>
			<VirtualizedList
				items={items}
				autoFollow={false}
				estimateItemHeight={item => Math.ceil(item.label.length / 30)}
				keyExtractor={item => item.id}
				renderItem={item => <Text>{item.label}</Text>}
			/>
		</Box>
	);
}
```

#### Props

- `items`, `renderItem`, `keyExtractor`: required generic list inputs.
- `estimateItemHeight`: optional estimator used before the real height is measured. Defaults to `1`.
- `overscan`: extra items rendered above and below the viewport. Defaults to `10`.
- `scrollStep`: line step for arrow-key scrolling. Defaults to `1`.
- `autoFollow`: when `true`, the list stays pinned to the bottom until the user scrolls away.
- `enableKeyboardScroll`: enables `Up`, `Down`, `PageUp`, and `PageDown`.
- `focusable`, `autoFocus`, `focusId`, `onFocusChange`: integrate with Ink focus management.
- `showScrollbar`, `scrollbarColor`, `scrollbarTrackColor`: configure the built-in block-style scrollbar column.
- `onScroll`: receives `scrollY`, `containerHeight`, `contentHeight`, `atTop`, and `atBottom`.
- `onVisibleRangeChange`: receives the current visible item range.
- Regular `Box` layout props such as `width`, `height`, `flexGrow`, and `flexShrink` are supported.

#### Ref API

- `scrollToOffset(offsetY)`
- `scrollToIndex(index, align?)`
- `scrollToTop()`
- `scrollToBottom()`
- `getScrollState()`

#### Keyboard Behavior

- `Up` / `Down`: scroll by `scrollStep`
- `PageUp` / `PageDown`: scroll by one viewport

#### Non-goals

- No mouse wheel or click handling
- No item selection or activation model
- No chat-specific UI such as “new messages” banners
