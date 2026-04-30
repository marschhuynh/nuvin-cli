export type OutputPreview = {
  hidden: number;
  preview: string;
};

const PREVIEW_CACHE_MAX = 32;
const previewCache = new Map<string, Map<string, OutputPreview>>();
let previewCacheSize = 0;

export function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const keep = Math.max(1, Math.floor((maxChars - 1) / 2));
  return `${text.slice(0, keep)}...${text.slice(-keep)}`;
}

function cacheKey(maxLines: number, fromEnd: boolean): string {
  return `${maxLines}:${fromEnd ? 1 : 0}`;
}

function getCachedPreview(text: string, key: string): OutputPreview | null {
  const byConfig = previewCache.get(text);
  const cached = byConfig?.get(key);
  if (!byConfig || !cached) return null;

  previewCache.delete(text);
  previewCache.set(text, byConfig);
  return cached;
}

function setCachedPreview(text: string, key: string, preview: OutputPreview): void {
  let byConfig = previewCache.get(text);
  if (!byConfig) {
    byConfig = new Map<string, OutputPreview>();
    previewCache.set(text, byConfig);
  } else {
    previewCache.delete(text);
    previewCache.set(text, byConfig);
  }

  if (!byConfig.has(key)) {
    previewCacheSize++;
  }
  byConfig.set(key, preview);

  while (previewCacheSize > PREVIEW_CACHE_MAX) {
    const oldestText = previewCache.keys().next().value;
    if (oldestText === undefined) break;
    const oldest = previewCache.get(oldestText);
    previewCache.delete(oldestText);
    previewCacheSize -= oldest?.size ?? 0;
  }
}

export function previewLines(text: string, maxLines: number, fromEnd: boolean): OutputPreview {
  const key = cacheKey(maxLines, fromEnd);
  const cached = getCachedPreview(text, key);
  if (cached) return cached;

  const trimmed = text.replace(/\s+$/, "");
  if (trimmed.length === 0) {
    const empty = { hidden: 0, preview: "" };
    setCachedPreview(text, key, empty);
    return empty;
  }

  const lines = trimmed.split("\n");
  if (lines.length <= maxLines) {
    const short = { hidden: 0, preview: trimmed };
    setCachedPreview(text, key, short);
    return short;
  }

  const visible = fromEnd ? lines.slice(-maxLines) : lines.slice(0, maxLines);
  const preview = {
    hidden: lines.length - maxLines,
    preview: visible.join("\n"),
  };
  setCachedPreview(text, key, preview);
  return preview;
}

export function getToolPreviewCacheSizeForTest(): number {
  return previewCacheSize;
}
