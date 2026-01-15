# Emoji Width Calculation Issue in Ink

## Problem Statement

Emojis with variation selectors (like ✅, ⚠️, ❌, ⏭️) are rendered with incorrect width, causing:
- Line breaks at wrong positions
- Border rendering misalignment
- Text overflow/overlap

## Root Cause

The issue is in `packages/ink/src/output.ts` where character tokenization and width calculation interact incorrectly.

### The Sequence of Events

1. **Tokenizer splits emoji sequences**: `@alcalzone/ansi-tokenize` splits `⏭️` into two tokens:
   - `⏭` (U+23ED) - base character
   - `️` (U+FE0F) - variation selector 16 (emoji presentation)

2. **Width calculated per token**: 
   ```
   stringWidth('⏭')  = 1  (base character alone)
   stringWidth('️')  = 0  (variation selector is zero-width)
   stringWidth('⏭️') = 2  (combined should be 2 columns!)
   ```

3. **Output processing** (output.ts lines 234-268):
   - Processes `⏭`: width = 1, advances `offsetX` by 1
   - Processes `️`: width = 0, appends to previous cell (correct)
   - **BUG**: After appending, `⏭️` should occupy 2 columns, but `offsetX` only advanced by 1

### Affected Emojis

Any emoji that uses variation selector U+FE0F to request emoji presentation:
- `⏭️` (next track) - base `⏭` is text by default
- `⚠️` (warning) - base `⚠` is text by default  
- `⏩️` (fast forward)
- `▶️` (play)
- Many others in the emoji spec

### Not Affected

Emojis that are emoji-by-default (don't need U+FE0F):
- `✅` (check mark) - already emoji presentation
- `❌` (cross mark) - already emoji presentation
- Most face emojis, hand emojis, etc.

## Solution

### Option 1: Re-measure after appending zero-width characters (Recommended)

In `output.ts`, after appending a zero-width character to the previous cell, re-measure the combined value and add padding cells if the width increased.

```typescript
if (rawWidth === 0) {
  // Zero-width characters should be appended to the previous cell
  const previousCell = currentLine[offsetX - 1];
  if (previousCell?.value) {
    const prevWidth = stringWidth(previousCell.value);
    previousCell.value += character.value;
    const newWidth = stringWidth(previousCell.value);
    
    // If the combined width increased, we need to add placeholder cells
    // The previous character already occupied 'prevWidth' cells,
    // but now it needs 'newWidth' cells
    const extraCells = newWidth - prevWidth;
    if (extraCells > 0) {
      // Insert empty cells for the extra width
      // These cells were already "used" by offsetX advancement, 
      // so we need to mark them as belonging to the wide character
      for (let i = 0; i < extraCells; i++) {
        currentLine[offsetX + i] = {
          type: 'char',
          value: '',
          fullWidth: false,
          styles: previousCell.styles,
        };
      }
      offsetX += extraCells;
    }
  }
  continue;
}
```

### Option 2: Fix tokenizer to keep emoji sequences together

Modify or replace `@alcalzone/ansi-tokenize` to properly handle Unicode emoji sequences using grapheme segmentation (e.g., via `Intl.Segmenter` or a library like `graphemer`).

This is more correct but requires upstream changes or library replacement.

### Option 3: Pre-process text with grapheme segmentation

Before tokenizing, segment text into grapheme clusters, then tokenize each cluster as a unit.

## Recommended Implementation

Option 1 is the least invasive fix. Here's the complete change for `output.ts`:

### Before (lines 236-248):
```typescript
if (rawWidth === 0) {
  // Zero-width characters should be appended to the previous cell
  // rather than taking up their own space
  const previousCell = currentLine[offsetX - 1];
  if (previousCell?.value) {
    previousCell.value += character.value;
  }

  // Don't advance offsetX for zero-width characters
  continue;
}
```

### After:
```typescript
if (rawWidth === 0) {
  // Zero-width characters (like variation selectors) should be appended
  // to the previous cell rather than taking up their own space
  const previousCell = currentLine[offsetX - 1];
  if (previousCell?.value) {
    // Measure width before and after appending
    const prevWidth = stringWidth(previousCell.value);
    previousCell.value += character.value;
    const newWidth = stringWidth(previousCell.value);

    // If combining the characters increased the display width,
    // we need to add placeholder cells for the extra columns.
    // This handles cases like ⏭ (width 1) + ️ (VS16) = ⏭️ (width 2)
    const extraWidth = newWidth - prevWidth;
    if (extraWidth > 0) {
      for (let i = 0; i < extraWidth; i++) {
        currentLine[offsetX + i] = {
          type: 'char',
          value: '',
          fullWidth: false,
          styles: previousCell.styles,
        };
      }
      offsetX += extraWidth;
    }
  }

  // Don't advance offsetX for zero-width characters (already handled above if width changed)
  continue;
}
```

## Testing

### Test Cases

1. **Basic emoji width**:
   ```
   ⏭️ test  <- should align properly
   12345678 <- reference line
   ```

2. **Mixed emojis**:
   ```
   ✅ pass | ❌ fail | ⏭️ skip
   ```

3. **In bordered box**:
   ```
   ┌──────────────────────┐
   │ ⏭️ Status: Ready     │
   └──────────────────────┘
   ```

### Verification

```javascript
// Test that widths are calculated correctly
import stringWidth from 'string-width';

const testCases = [
  { emoji: '⏭️', expected: 2 },
  { emoji: '⚠️', expected: 2 },
  { emoji: '✅', expected: 2 },
  { emoji: '❌', expected: 2 },
  { emoji: '▶️', expected: 2 },
];

testCases.forEach(({ emoji, expected }) => {
  const width = stringWidth(emoji);
  console.log(`${emoji}: ${width} (expected ${expected}) ${width === expected ? '✓' : '✗'}`);
});
```

## Files to Modify

| File | Change |
|------|--------|
| `packages/ink/src/output.ts` | Fix zero-width character handling to account for width changes |

## Related Issues

- Affects any text with emoji variation selectors
- Terminal-specific: Different terminals may render emojis differently
- `string-width` library correctly reports combined width; the issue is in how we process tokenized characters
