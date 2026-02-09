# Base64 Image Content in Tool Results — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform base64 image data in tool results (MCP, bash_tool, file_read) into proper image content blocks that LLMs can see as vision input — reusing the same image pipeline that already works for pasted images.

**Architecture:** Add a base64 image detection utility that scans tool result strings for image data. Modify the tool result processing pipeline to produce `MessageContent` with `ImageContentPart` blocks instead of plain strings. Update MCP content flattening to extract structured image blocks. Update provider adapters to support image content in tool result messages.

**Tech Stack:** TypeScript, Vitest, existing `ImageContentPart` / `ProviderContentPart` types

---

## Overview of Changes

The existing image pipeline for pasted images is:
```
UserAttachment → ImageContentPart → MessageContent(parts) → ProviderContentPart(image_url) → Provider-specific format
```

We need to add a parallel entry point for tool results:
```
Tool result string/MCP image block → detect base64 image → ImageContentPart → MessageContent(parts) → same pipeline
```

**Files to modify:**
- `packages/nuvin-core/src/utils/base64-image-detector.ts` (NEW)
- `packages/nuvin-core/src/mcp/mcp-tools.ts`
- `packages/nuvin-core/src/ports.ts`
- `packages/nuvin-core/src/orchestrator.ts`
- `packages/nuvin-core/src/llm-anthropic-compat.ts`
- `packages/nuvin-core/src/llm-anthropic-aisdk.ts`
- `packages/nuvin-core/src/responses-api-transform.ts`

---

## Task 1: Base64 Image Detection Utility

**Files:**
- Create: `packages/nuvin-core/src/utils/base64-image-detector.ts`
- Create: `packages/nuvin-core/src/tests/base64-image-detector.test.ts`

This utility detects base64-encoded image data in strings and extracts it into `ImageContentPart` blocks. It handles two formats:
1. Data URIs: `data:image/png;base64,iVBOR...`
2. Raw base64 blobs that start with known image magic bytes (PNG: `iVBOR`, JPEG: `/9j/`, GIF: `R0lGOD`, WebP: `UklGR`)

**Step 1: Write the failing tests**

Create `packages/nuvin-core/src/tests/base64-image-detector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractBase64Images, type ExtractedContent } from '../utils/base64-image-detector.js';

describe('extractBase64Images', () => {
  it('returns original text when no images found', () => {
    const result = extractBase64Images('just plain text');
    expect(result).toEqual([{ type: 'text', text: 'just plain text' }]);
  });

  it('extracts data URI with image/png', () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const input = `Here is an image: data:image/png;base64,${b64} and some text after`;
    const result = extractBase64Images(input);
    expect(result).toEqual([
      { type: 'text', text: 'Here is an image: ' },
      { type: 'image', mimeType: 'image/png', data: b64 },
      { type: 'text', text: ' and some text after' },
    ]);
  });

  it('extracts data URI with image/jpeg', () => {
    const b64 = '/9j/4AAQSkZJRgABAQEASABIAAD';
    const input = `data:image/jpeg;base64,${b64}`;
    const result = extractBase64Images(input);
    expect(result).toEqual([
      { type: 'image', mimeType: 'image/jpeg', data: b64 },
    ]);
  });

  it('extracts multiple data URIs', () => {
    const b64a = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNjN9GQAAAAlwSFlzAAAWJQ==';
    const b64b = '/9j/4AAQSkZJRgABAQEASABIAAD';
    const input = `Image 1: data:image/png;base64,${b64a} Image 2: data:image/jpeg;base64,${b64b}`;
    const result = extractBase64Images(input);
    expect(result.length).toBe(4);
    expect(result[0]).toEqual({ type: 'text', text: 'Image 1: ' });
    expect(result[1]).toEqual({ type: 'image', mimeType: 'image/png', data: b64a });
    expect(result[2]).toEqual({ type: 'text', text: ' Image 2: ' });
    expect(result[3]).toEqual({ type: 'image', mimeType: 'image/jpeg', data: b64b });
  });

  it('handles data URI as entire string', () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const input = `data:image/png;base64,${b64}`;
    const result = extractBase64Images(input);
    expect(result).toEqual([
      { type: 'image', mimeType: 'image/png', data: b64 },
    ]);
  });

  it('ignores non-image data URIs', () => {
    const input = 'data:text/plain;base64,SGVsbG8gV29ybGQ=';
    const result = extractBase64Images(input);
    expect(result).toEqual([{ type: 'text', text: input }]);
  });

  it('returns empty array for empty string', () => {
    const result = extractBase64Images('');
    expect(result).toEqual([]);
  });

  it('filters out empty text segments', () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const input = `data:image/png;base64,${b64}`;
    const result = extractBase64Images(input);
    expect(result.every(r => !(r.type === 'text' && r.text === ''))).toBe(true);
  });

  it('supports image/webp', () => {
    const b64 = 'UklGRlYAAABXRUJQVlA4IEoAAADQAQCdASoBAAEAAkA4JZQCdAEO/hepgAAA';
    const input = `data:image/webp;base64,${b64}`;
    const result = extractBase64Images(input);
    expect(result).toEqual([
      { type: 'image', mimeType: 'image/webp', data: b64 },
    ]);
  });

  it('supports image/gif', () => {
    const b64 = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const input = `data:image/gif;base64,${b64}`;
    const result = extractBase64Images(input);
    expect(result).toEqual([
      { type: 'image', mimeType: 'image/gif', data: b64 },
    ]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd packages/nuvin-core && npx vitest run src/tests/base64-image-detector.test.ts`
Expected: FAIL — module not found

**Step 3: Implement the detection utility**

Create `packages/nuvin-core/src/utils/base64-image-detector.ts`:

```typescript
import type { ImageContentPart, TextContentPart } from '../ports.js';

export type ExtractedContent =
  | { type: 'text'; text: string }
  | { type: 'image'; mimeType: string; data: string };

const DATA_URI_REGEX = /data:(image\/(?:png|jpeg|jpg|gif|webp|svg\+xml|bmp|tiff));base64,([A-Za-z0-9+/\n\r]+=*)/g;

export function extractBase64Images(input: string): ExtractedContent[] {
  if (!input) return [];

  const results: ExtractedContent[] = [];
  let lastIndex = 0;

  for (const match of input.matchAll(DATA_URI_REGEX)) {
    const matchStart = match.index!;
    const mimeType = match[1]!;
    const data = match[2]!;

    if (matchStart > lastIndex) {
      results.push({ type: 'text', text: input.slice(lastIndex, matchStart) });
    }

    results.push({ type: 'image', mimeType, data });
    lastIndex = matchStart + match[0].length;
  }

  if (lastIndex < input.length) {
    results.push({ type: 'text', text: input.slice(lastIndex) });
  }

  if (results.length === 0 && input.length > 0) {
    results.push({ type: 'text', text: input });
  }

  return results;
}

export function hasBase64Images(input: string): boolean {
  return DATA_URI_REGEX.test(input);
}

export function toMessageContentParts(extracted: ExtractedContent[]): Array<TextContentPart | ImageContentPart> {
  return extracted.map((item) => {
    if (item.type === 'text') {
      return { type: 'text' as const, text: item.text };
    }
    return {
      type: 'image' as const,
      mimeType: item.mimeType,
      data: item.data,
    };
  });
}
```

**Step 4: Run tests to verify they pass**

Run: `cd packages/nuvin-core && npx vitest run src/tests/base64-image-detector.test.ts`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/nuvin-core/src/utils/base64-image-detector.ts packages/nuvin-core/src/tests/base64-image-detector.test.ts
git commit -m "feat: add base64 image detection utility"
```

---

## Task 2: MCP Image Content Block Extraction

**Files:**
- Modify: `packages/nuvin-core/src/mcp/mcp-tools.ts:9-11` (MCPToolCallResponse type), `:25-37` (flattenMcpContent)
- Test: `packages/nuvin-core/src/tests/mcp-tool-image-content.test.ts` (NEW)

Currently `flattenMcpContent()` treats image blocks as opaque JSON. We need it to return image blocks alongside text.

**Step 1: Write the failing tests**

Create `packages/nuvin-core/src/tests/mcp-tool-image-content.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
// We'll test via the flattenMcpContent function — need to export it or test indirectly
// If not exported, we test through the MCP tool execution path

describe('MCP image content handling', () => {
  it('extracts image content blocks from MCP response', () => {
    // Test that MCP tool results with type:'image' produce ImageContentPart
    // Exact test implementation depends on whether flattenMcpContent is exported
    // See implementation step for details
  });
});
```

> **Note to implementer:** The exact test approach depends on the export structure of `mcp-tools.ts`. If `flattenMcpContent` is not exported, write an integration-style test that calls the MCP tool executor with a mocked MCP client that returns image content. Check the existing tests in `src/tests/mcp-tool-validation.test.ts` for patterns.

**Step 2: Modify the MCPContent interface**

In `packages/nuvin-core/src/mcp/mcp-tools.ts`, update the content interface to include image fields:

```typescript
// Was:
interface MCPContent {
  type: string;
  text?: string;
}

// Becomes:
interface MCPContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}
```

Also update `MCPToolCallResponse`:

```typescript
// Was:
interface MCPToolCallResponse {
  content: Array<{ type: string; text?: string }>;
}

// Becomes:
interface MCPToolCallResponse {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
}
```

**Step 3: Update flattenMcpContent to return image data**

The return type of `flattenMcpContent` needs to support images. We add a new return variant:

```typescript
import type { ImageContentPart, TextContentPart } from '../ports.js';

type FlatResult =
  | { type: 'text'; value: string }
  | { type: 'json'; value: Record<string, unknown> | unknown[] }
  | { type: 'mixed'; parts: Array<TextContentPart | ImageContentPart> };

function flattenMcpContent(content: MCPContent[] | undefined): FlatResult {
  if (!content || content.length === 0) return { type: 'text', value: '' };

  const hasImages = content.some((c) => c.type === 'image' && c.data && c.mimeType);

  if (hasImages) {
    const parts: Array<TextContentPart | ImageContentPart> = [];
    for (const c of content) {
      if (c.type === 'text' && typeof c.text === 'string') {
        parts.push({ type: 'text', text: c.text });
      } else if (c.type === 'image' && c.data && c.mimeType) {
        parts.push({ type: 'image', mimeType: c.mimeType, data: c.data });
      }
    }
    return { type: 'mixed', parts };
  }

  const allText = content.every((c) => c && c.type === 'text' && typeof c.text === 'string');
  if (allText) return { type: 'text', value: content.map((c) => c.text).join('\n') };
  return { type: 'json', value: content };
}
```

**Step 4: Update the call site** (around line 174) to handle the `'mixed'` case:

```typescript
const flat = flattenMcpContent((res as MCPToolCallResponse).content);
if (flat.type === 'text') {
  return { id: c.id, name: c.name, status: 'success' as const, type: 'text' as const, result: flat.value };
} else if (flat.type === 'mixed') {
  return { id: c.id, name: c.name, status: 'success' as const, type: 'mixed' as const, result: flat.parts };
} else {
  return { id: c.id, name: c.name, status: 'success' as const, type: 'json' as const, result: flat.value };
}
```

**Step 5: Run tests**

Run: `cd packages/nuvin-core && npx vitest run src/tests/mcp-tool-image-content.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add packages/nuvin-core/src/mcp/mcp-tools.ts packages/nuvin-core/src/tests/mcp-tool-image-content.test.ts
git commit -m "feat: extract image content blocks from MCP tool results"
```

---

## Task 3: Extend ToolExecutionResult with Image Support

**Files:**
- Modify: `packages/nuvin-core/src/ports.ts:265-364` (ToolExecutionResult type)
- Test: `packages/nuvin-core/src/tests/tool-execution-result-types.test.ts` (existing — extend)

**Step 1: Add a `'mixed'` type variant to ToolExecutionResult**

In `packages/nuvin-core/src/ports.ts`, add a new variant that can carry mixed text+image parts. Add this before the generic catch-all:

```typescript
// New: mixed content (text + images) from tools
| {
    id: string;
    name: string;
    status: 'success';
    type: 'mixed';
    result: Array<TextContentPart | ImageContentPart>;
    metadata?: Record<string, unknown>;
    durationMs?: number;
  }
```

**Step 2: Run existing type tests to verify nothing breaks**

Run: `cd packages/nuvin-core && npx vitest run src/tests/tool-execution-result-types.test.ts`
Expected: PASS (existing tests still work)

**Step 3: Commit**

```bash
git add packages/nuvin-core/src/ports.ts
git commit -m "feat: add 'mixed' type variant to ToolExecutionResult for image content"
```

---

## Task 4: Orchestrator — Convert Tool Results to Image-Aware Messages

**Files:**
- Modify: `packages/nuvin-core/src/orchestrator.ts:886-933` (tool result processing)
- Create: `packages/nuvin-core/src/tests/orchestrator-image-tool-results.test.ts`

This is the core change. The orchestrator must:
1. For `type: 'mixed'` results (from MCP), build `MessageContent` with image parts
2. For `type: 'text'` results (from bash_tool, file_read), auto-detect base64 data URIs and extract images
3. Pass the resulting `MessageContent` through to the message (where `toProviderContent` already handles images)

**Step 1: Write failing tests**

Create `packages/nuvin-core/src/tests/orchestrator-image-tool-results.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractBase64Images, toMessageContentParts } from '../utils/base64-image-detector.js';

describe('orchestrator image tool result handling', () => {
  it('converts text result with data URI to mixed content', () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const input = `Screenshot captured: data:image/png;base64,${b64}`;
    const extracted = extractBase64Images(input);
    const parts = toMessageContentParts(extracted);

    expect(parts.length).toBe(2);
    expect(parts[0]).toEqual({ type: 'text', text: 'Screenshot captured: ' });
    expect(parts[1]).toEqual({ type: 'image', mimeType: 'image/png', data: b64 });
  });

  it('leaves plain text results as strings', () => {
    const input = 'File contents: hello world';
    const extracted = extractBase64Images(input);
    expect(extracted.length).toBe(1);
    expect(extracted[0]).toEqual({ type: 'text', text: input });
  });
});
```

**Step 2: Run tests to verify they fail (or pass if utility already exists)**

Run: `cd packages/nuvin-core && npx vitest run src/tests/orchestrator-image-tool-results.test.ts`

**Step 3: Modify orchestrator tool result processing**

In `packages/nuvin-core/src/orchestrator.ts`, import the detection utility and update the tool result → message conversion (around lines 886-933):

```typescript
import { extractBase64Images, toMessageContentParts } from './utils/base64-image-detector.js';
```

Then update the tool result processing loop. Replace the existing block that builds `contentStr` with:

```typescript
const toolResultMsgs: Message[] = [];
for (const tr of toolResults) {
  let messageContent: MessageContent;

  if (tr.status === 'error') {
    messageContent = tr.result as string;
  } else if (tr.type === 'mixed') {
    // MCP tools that returned structured image blocks
    messageContent = { type: 'parts', parts: tr.result };
  } else if (tr.type === 'text') {
    const text = tr.result as string;
    const extracted = extractBase64Images(text);
    const hasImages = extracted.some((e) => e.type === 'image');
    if (hasImages) {
      messageContent = { type: 'parts', parts: toMessageContentParts(extracted) };
    } else {
      messageContent = text;
    }
  } else {
    // JSON results — stringify as before
    messageContent = JSON.stringify(tr.result, null, 2);
  }

  toolResultMsgs.push({
    id: tr.id,
    role: 'tool',
    content: messageContent,
    timestamp: this.clock.iso(),
    tool_call_id: tr.id,
    name: tr.name,
    status: tr.status,
    durationMs: tr.durationMs,
    metadata: tr.metadata,
  });

  this.metrics?.recordToolCall?.();
}
```

Also update the `accumulatedMessages` block similarly (around lines 923-933), building `ChatMessage` content:

```typescript
for (const tr of toolResults) {
  let chatContent: string | ProviderContentPart[];

  if (tr.status === 'error') {
    chatContent = tr.result as string;
  } else if (tr.type === 'mixed') {
    chatContent = toProviderContentFromParts(tr.result);
  } else if (tr.type === 'text') {
    const text = tr.result as string;
    const extracted = extractBase64Images(text);
    const hasImages = extracted.some((e) => e.type === 'image');
    if (hasImages) {
      chatContent = toProviderContentFromParts(toMessageContentParts(extracted));
    } else {
      chatContent = text;
    }
  } else {
    chatContent = JSON.stringify(tr.result, null, 2);
  }

  accumulatedMessages.push({
    role: 'tool',
    content: chatContent,
    tool_call_id: tr.id,
    name: tr.name,
  });
}
```

You'll need a helper to convert parts to `ProviderContentPart[]` (or reuse `toProviderContent` from `context.ts`):

```typescript
function toProviderContentFromParts(parts: Array<TextContentPart | ImageContentPart>): ProviderContentPart[] {
  const result: ProviderContentPart[] = [];
  for (const part of parts) {
    if (part.type === 'text') {
      if (part.text.length > 0) result.push({ type: 'text', text: part.text });
    } else {
      const url = `data:${part.mimeType};base64,${part.data}`;
      result.push({ type: 'image_url', image_url: { url } });
    }
  }
  return result;
}
```

**Step 4: Run all orchestrator tests**

Run: `cd packages/nuvin-core && npx vitest run src/tests/orchestrator`
Expected: All PASS

**Step 5: Commit**

```bash
git add packages/nuvin-core/src/orchestrator.ts packages/nuvin-core/src/tests/orchestrator-image-tool-results.test.ts
git commit -m "feat: orchestrator converts base64 image tool results to image content blocks"
```

---

## Task 5: Provider Adapters — Support Image Content in Tool Results

**Files:**
- Modify: `packages/nuvin-core/src/llm-anthropic-compat.ts:170-191`
- Modify: `packages/nuvin-core/src/llm-anthropic-aisdk.ts:170-184`
- Modify: `packages/nuvin-core/src/responses-api-transform.ts:128-134`
- Test: `packages/nuvin-core/src/tests/provider-image-tool-results.test.ts` (NEW)

Now that the orchestrator can produce `ProviderContentPart[]` for tool results, the provider adapters need to handle arrays (not just strings) in tool result messages.

### 5a: Anthropic Compat Adapter

In `llm-anthropic-compat.ts`, the `tool_result` handling (around line 170-191) currently produces `content: string`. Update to support `content: Array<AnthropicContentPart>` when images are present:

```typescript
if (msg.role === 'tool') {
  const toolResultContent = (() => {
    if (typeof msg.content === 'string') {
      return msg.content;
    }
    if (Array.isArray(msg.content)) {
      // ProviderContentPart[] — convert to Anthropic format
      return (msg.content as ProviderContentPart[]).map((part) => {
        if (part.type === 'text') {
          return { type: 'text' as const, text: part.text };
        }
        if (part.type === 'image_url') {
          const url = part.image_url.url;
          const match = url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            return {
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: match[1]!, data: match[2]! },
            };
          }
        }
        return { type: 'text' as const, text: JSON.stringify(part) };
      });
    }
    return JSON.stringify(msg.content);
  })();

  // ... push to anthropicMessages with content: toolResultContent
}
```

### 5b: Anthropic AI SDK Adapter

In `llm-anthropic-aisdk.ts`, update the tool result output to support multipart:

```typescript
if (msg.role === 'tool') {
  if (Array.isArray(msg.content)) {
    // Has image content — pass parts
    const parts = (msg.content as ProviderContentPart[]).map((part) => {
      if (part.type === 'image_url') {
        return { type: 'image' as const, image: part.image_url.url };
      }
      return { type: 'text' as const, text: part.type === 'text' ? part.text : JSON.stringify(part) };
    });
    return {
      role: 'tool' as const,
      content: [{
        type: 'tool-result' as const,
        toolCallId: msg.tool_call_id || '',
        toolName: msg.name || '',
        output: parts, // AI SDK supports multipart tool results
      }],
    };
  }
  // ... existing string-only path
}
```

> **Note to implementer:** Check the Vercel AI SDK docs for exact format of multipart tool results. The SDK may use a different structure. Verify with: `pnpm ls ai @ai-sdk/anthropic` to check versions.

### 5c: Responses API (OpenAI/Google)

In `responses-api-transform.ts`, OpenAI's Responses API only supports `output: string` for function call outputs. We must stringify image data but prepend a note:

```typescript
if (msg.role === 'tool') {
  let output: string;
  if (typeof msg.content === 'string') {
    output = msg.content;
  } else if (Array.isArray(msg.content)) {
    // Can't send images in tool results via Responses API
    // Stringify but preserve information
    output = (msg.content as ProviderContentPart[])
      .map((part) => {
        if (part.type === 'text') return part.text;
        if (part.type === 'image_url') return '[Image content included in tool result]';
        return JSON.stringify(part);
      })
      .join('\n');
  } else {
    output = JSON.stringify(msg.content);
  }
  input.push({
    type: 'function_call_output',
    call_id: msg.tool_call_id || '',
    output,
  });
  continue;
}
```

### 5d: BaseLLM (OpenAI Chat Completions)

`BaseLLM` passes `ChatMessage[]` directly. Since `ChatMessage.content` already supports `ProviderContentPart[]`, and OpenAI Chat Completions API supports `content: [{type: 'image_url', ...}]` in tool messages, **no changes needed here**.

**Step 5e: Write tests**

Create `packages/nuvin-core/src/tests/provider-image-tool-results.test.ts` testing that each adapter correctly handles tool result messages with `ProviderContentPart[]` content containing image_url blocks.

**Step 5f: Run all provider tests**

Run: `cd packages/nuvin-core && npx vitest run`
Expected: All PASS

**Step 5g: Commit**

```bash
git add packages/nuvin-core/src/llm-anthropic-compat.ts packages/nuvin-core/src/llm-anthropic-aisdk.ts packages/nuvin-core/src/responses-api-transform.ts packages/nuvin-core/src/tests/provider-image-tool-results.test.ts
git commit -m "feat: provider adapters support image content in tool results"
```

---

## Task 6: Context Builder — Ensure Tool Messages Pass Through Images

**Files:**
- Verify: `packages/nuvin-core/src/context.ts:61-69`

The `SimpleContextBuilder.toProviderMessages` already calls `toProviderContent` on all messages including tool messages (line 43), and the tool message branch (line 61-69) passes through the result. However, line 65 has:

```typescript
content: typeof providerContent === 'string' ? providerContent : (providerContent ?? ''),
```

This already passes `ProviderContentPart[]` through when `providerContent` is not a string. **Verify this works correctly with a test** — no code change should be needed.

**Step 1: Add a verification test**

Add to existing context tests or create new:

```typescript
it('passes image content through for tool messages', () => {
  const builder = new SimpleContextBuilder();
  const history: Message[] = [{
    id: 'tool-1',
    role: 'tool',
    content: {
      type: 'parts',
      parts: [
        { type: 'text', text: 'Screenshot:' },
        { type: 'image', mimeType: 'image/png', data: 'iVBOR...' },
      ],
    },
    tool_call_id: 'call-1',
    name: 'mcp_figma_get_screenshot',
  }];
  const result = builder.toProviderMessages(history, 'system', []);
  const toolMsg = result.find((m) => m.role === 'tool');
  expect(Array.isArray(toolMsg?.content)).toBe(true);
  expect((toolMsg?.content as any[])[1].type).toBe('image_url');
});
```

**Step 2: Commit**

```bash
git add packages/nuvin-core/src/tests/
git commit -m "test: verify context builder passes image content in tool messages"
```

---

## Task 7: End-to-End Verification & Cleanup

**Files:**
- Run: Full test suite
- Verify: TypeScript compilation

**Step 1: Run full test suite**

```bash
cd packages/nuvin-core && npx vitest run
```

Expected: All tests PASS

**Step 2: Check TypeScript compilation**

```bash
cd packages/nuvin-core && npx tsc --noEmit
```

Expected: No errors

**Step 3: Build**

```bash
cd packages/nuvin-core && pnpm build
```

Expected: Build succeeds

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: base64 image content in tool results — complete"
```

---

## Summary of Data Flow (After Implementation)

```
MCP Tool (returns {type:'image', data, mimeType})
  → flattenMcpContent() extracts image blocks → type:'mixed' ToolExecutionResult
  → orchestrator builds MessageContent with ImageContentPart
  → toProviderContent converts to ProviderContentPart with image_url
  → provider adapter sends as vision input

bash_tool / file_read (returns string with data:image/...;base64,...)
  → extractBase64Images() finds data URIs → splits into text + image parts
  → orchestrator builds MessageContent with ImageContentPart
  → same pipeline as above
```

The LLM sees the image as a proper vision input, exactly like a pasted screenshot.
