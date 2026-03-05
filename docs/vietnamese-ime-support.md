# Vietnamese IME Support Plan

## Problem Analysis

Vietnamese IMEs (OpenKey, EVKey, Unikey, PHTV) work by:
1. User types keystroke (e.g., `a` then `>` to make `ă`)
2. IME sends: `\x7f` (backspace) + replacement character
3. Terminal receives these as separate input chunks

### Current Behavior in Nuvin

- `\x7f` → `key.backspace = true` → deletes one character
- Replacement char → inserted as new character
- Result: Works correctly for simple cases

### The Actual Issue

When typing quickly or with certain IME configurations, multiple `\x7f` + char sequences can arrive in a single chunk, like `\x7f\x7fă`. The current `splitInputChunks` function in `parseKeypress.ts` splits these into individual characters:

```typescript
// Current behavior for "\x7f\x7fă"
// Splits into: ["\x7f", "\x7f", "ă"]
// Results in: 2 backspaces + insert "ă"
```

This can cause incorrect behavior if the IME expects atomic processing of the sequence.

## Solution Approach

### Option 1: Process at TextInput Level (Recommended)

**Description:** Modify `TextInput.tsx` to detect Vietnamese IME patterns and process them atomically.

**Pros:**
- Localized change, doesn't affect other input handling
- Easier to test and maintain
- Can be enabled/disabled per component

**Cons:**
- Only fixes TextInput component
- Won't fix other input consumers

### Option 2: Process at parseKeypress Level

**Description:** Modify `parseKeypress.ts` to detect and handle IME sequences globally.

**Pros:**
- Fixes all input handling globally
- Single source of truth for IME handling

**Cons:**
- More invasive change
- Affects all input consumers
- Harder to test edge cases

### Option 3: Middleware Approach (Cleanest)

**Description:** Create an optional Vietnamese IME middleware that users can enable via config.

**Pros:**
- Non-breaking, opt-in
- Testable in isolation
- Can be toggled via configuration

**Cons:**
- Requires user configuration
- Adds complexity to middleware system

## Recommended Implementation: Option 1 (TextInput-level)

### Changes Needed

#### 1. Create Vietnamese IME Utility

**File:** `packages/nuvin-cli/source/utils/vietnameseIME.ts`

```typescript
/**
 * Detects if input contains a Vietnamese IME sequence.
 *
 * Vietnamese IMEs send backspace (\x7f) followed by replacement characters.
 * This function detects such patterns and extracts the characters to insert.
 *
 * @param input - Raw input string from stdin
 * @returns Object indicating if this is an IME sequence and how to process it
 */
export function detectVietnameseIMESequence(input: string): {
  isIMESequence: boolean;
  charsToInsert: string;
  backspaceCount: number;
} {
  // Count backspace characters
  const backspaceCount = (input.match(/\x7f/g) || []).length;

  if (backspaceCount === 0) {
    return { isIMESequence: false, charsToInsert: '', backspaceCount: 0 };
  }

  // Remove backspaces to get the actual characters
  const charsToInsert = input.replace(/\x7f/g, '');

  // Only treat as IME sequence if we have both backspaces and printable chars
  if (charsToInsert.length === 0) {
    return { isIMESequence: false, charsToInsert: '', backspaceCount: 0 };
  }

  return {
    isIMESequence: true,
    charsToInsert,
    backspaceCount,
  };
}

/**
 * Applies a Vietnamese IME sequence to the current value.
 *
 * @param value - Current input value
 * @param cursorOffset - Current cursor position
 * @param charsToInsert - Characters to insert
 * @param backspaceCount - Number of backspaces to apply
 * @returns New value and cursor position
 */
export function applyIMESequence(
  value: string,
  cursorOffset: number,
  charsToInsert: string,
  backspaceCount: number,
): { value: string; cursorOffset: number } {
  // Apply backspaces (delete characters before cursor)
  const deleteCount = Math.min(backspaceCount, cursorOffset);
  const newCursorOffset = cursorOffset - deleteCount;
  const newValue =
    value.slice(0, newCursorOffset) + charsToInsert + value.slice(cursorOffset);

  return {
    value: newValue,
    cursorOffset: newCursorOffset + charsToInsert.length,
  };
}
```

#### 2. Modify TextInput Component

**File:** `packages/nuvin-cli/source/components/TextInput/TextInput.tsx`

Add the IME detection logic in the `handleInput` callback:

```typescript
import { detectVietnameseIMESequence, applyIMESequence } from '@/utils/vietnameseIME.js';

const handleInput = useCallback(
  (input: string, key: InputKey) => {
    // ... existing paste handling ...

    // Check for Vietnamese IME sequence
    const imeSequence = detectVietnameseIMESequence(input);

    if (imeSequence.isIMESequence) {
      const result = applyIMESequence(
        currentValue,
        currentCursorOffset,
        imeSequence.charsToInsert,
        imeSequence.backspaceCount,
      );
      setValueRef.current(result.value, result.cursorOffset);
      return true;
    }

    // ... rest of existing input handling ...
  },
  [/* existing deps */],
);
```

#### 3. Add Configuration Option

**File:** `packages/nuvin-cli/source/components/TextInput/TextInput.tsx`

Add a prop to enable/disable Vietnamese IME support:

```typescript
export type Props = {
  // ... existing props ...
  readonly enableVietnameseIME?: boolean;
};

function TextInput({
  // ... existing props ...
  enableVietnameseIME = true,
}: Props) {
  // In handleInput:
  if (enableVietnameseIME) {
    const imeSequence = detectVietnameseIMESequence(input);
    if (imeSequence.isIMESequence) {
      // ... apply IME sequence ...
    }
  }
}
```

#### 4. Add Tests

**File:** `packages/nuvin-cli/source/components/TextInput/TextInput.test.tsx`

```typescript
import { detectVietnameseIMESequence, applyIMESequence } from '@/utils/vietnameseIME.js';

describe('Vietnamese IME Support', () => {
  describe('detectVietnameseIMESequence', () => {
    it('should detect simple IME sequence', () => {
      const result = detectVietnameseIMESequence('\x7fă');
      expect(result.isIMESequence).toBe(true);
      expect(result.charsToInsert).toBe('ă');
      expect(result.backspaceCount).toBe(1);
    });

    it('should detect multiple backspaces', () => {
      const result = detectVietnameseIMESequence('\x7f\x7fâ');
      expect(result.isIMESequence).toBe(true);
      expect(result.charsToInsert).toBe('â');
      expect(result.backspaceCount).toBe(2);
    });

    it('should not detect normal backspace', () => {
      const result = detectVietnameseIMESequence('\x7f');
      expect(result.isIMESequence).toBe(false);
    });

    it('should not detect normal input', () => {
      const result = detectVietnameseIMESequence('abc');
      expect(result.isIMESequence).toBe(false);
    });
  });

  describe('applyIMESequence', () => {
    it('should replace character with IME output', () => {
      const result = applyIMESequence('a', 1, 'ă', 1);
      expect(result.value).toBe('ă');
      expect(result.cursorOffset).toBe(1);
    });

    it('should handle multiple backspaces', () => {
      const result = applyIMESequence('ab', 2, 'ô', 2);
      expect(result.value).toBe('ô');
      expect(result.cursorOffset).toBe(1);
    });

    it('should preserve text after cursor', () => {
      const result = applyIMESequence('a|bc', 1, 'ă', 1);
      expect(result.value).toBe('ăbc');
      expect(result.cursorOffset).toBe(1);
    });
  });
});
```

## Testing Strategy

### Manual Testing

1. **Test common Vietnamese characters:**
   - ă, â, ê, ô, ơ, ư, đ
   - Combinations: ắ, ấ, ế, ố, ớ, ứ

2. **Test tone marks:**
   - à, á, ả, ã, ạ
   - With vowels: ầ, ẩ, ẫ, ậ

3. **Test rapid typing:**
   - Type multiple Vietnamese characters in quick succession
   - Verify no character loss or duplication

4. **Test edge cases:**
   - Normal backspace should still work
   - Other input methods shouldn't be affected
   - Cursor positioning should be correct

### Automated Testing

- Unit tests for `detectVietnameseIMESequence`
- Unit tests for `applyIMESequence`
- Integration tests with TextInput component
- Tests with various IME configurations

## Implementation Checklist

- [ ] Create `packages/nuvin-cli/source/utils/vietnameseIME.ts`
- [ ] Modify `packages/nuvin-cli/source/components/TextInput/TextInput.tsx`
- [ ] Add `enableVietnameseIME` prop to TextInput
- [ ] Create `packages/nuvin-cli/source/components/TextInput/TextInput.test.tsx`
- [ ] Test with OpenKey IME
- [ ] Test with EVKey IME
- [ ] Test with Unikey IME
- [ ] Test with PHTV IME
- [ ] Verify normal backspace still works
- [ ] Update documentation

## Rollout Plan

1. **Phase 1:** Implement and test locally
2. **Phase 2:** Add feature flag (enabled by default)
3. **Phase 3:** Monitor for issues
4. **Phase 4:** If no issues, remove feature flag option

## References

- Original fix for Claude Code: [fix-vietnamese-claude-code](https://github.com/0x0a0d/fix-vietnamese-claude-code)
- Vietnamese IME implementations:
  - [OpenKey](https://openkim.vn/)
  - [EVKey](https://evkey.vn/)
  - [Unikey](https://unikey.org/)
  - [PHTV](https://github.com/phamhungtien/PHTV)
