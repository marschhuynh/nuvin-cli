import { markdownCache } from "#src/lib/markdown/cache.js";
import { markdownProvider } from "#src/lib/markdown/provider.js";
import type { Theme } from "#src/lib/theme/runtime.js";

export type MarkdownRenderOptions = {
  enableCache?: boolean;
  reflowText?: boolean;
  theme: Theme;
  width: number;
};

export function renderMarkdownToText(content: string, options: MarkdownRenderOptions): string {
  const rawContent = content ?? "";
  const rendererConfig = {
    reflowText: options.reflowText ?? false,
    tokens: options.theme.tokens,
    width: options.width,
  };
  const configHash = JSON.stringify(rendererConfig);

  if (options.enableCache ?? true) {
    const cached = markdownCache.get(rawContent, configHash);
    if (cached) {
      return cached;
    }
  }

  try {
    const renderer = markdownProvider.getRenderer(rendererConfig);
    const result = renderer.parse(rawContent, {
      async: false,
      breaks: true,
      gfm: true,
    }) as string;
    const rendered = result.trimEnd();

    if (options.enableCache ?? true) {
      markdownCache.set(rawContent, configHash, rendered);
    }

    return rendered;
  } catch {
    return rawContent;
  }
}

export function renderedMarkdownLineCount(content: string, options: MarkdownRenderOptions): number {
  const rendered = renderMarkdownToText(content, options);
  return rendered.length > 0 ? rendered.split("\n").length : 1;
}
