import { Marked, marked } from "marked";

import {
  type ThemeTokens,
  terminalRenderer,
} from "#src/lib/markdown/renderers/terminal-renderer.js";

type RendererConfig = {
  reflowText?: boolean;
  tokens: ThemeTokens;
  width: number;
};

const RENDERER_CACHE_MAX = 16;

const rendererCacheKey = (config: RendererConfig): string =>
  JSON.stringify({
    reflowText: config.reflowText ?? false,
    tokens: config.tokens,
    width: config.width,
  });

class MarkdownProvider {
  private static instance: MarkdownProvider;
  private rendererCache = new Map<string, Marked>();

  private constructor() {}

  static getInstance(): MarkdownProvider {
    if (!MarkdownProvider.instance) {
      MarkdownProvider.instance = new MarkdownProvider();
    }
    return MarkdownProvider.instance;
  }

  getRenderer(config: RendererConfig): Marked {
    const key = rendererCacheKey(config);
    const cached = this.rendererCache.get(key);
    if (cached) {
      this.rendererCache.delete(key);
      this.rendererCache.set(key, cached);
      return cached;
    }

    const renderer = this.configureRenderer(config);
    this.rendererCache.set(key, renderer);
    if (this.rendererCache.size > RENDERER_CACHE_MAX) {
      const oldest = this.rendererCache.keys().next().value;
      if (oldest !== undefined) {
        this.rendererCache.delete(oldest);
      }
    }
    return renderer;
  }

  private configureRenderer(config: RendererConfig): Marked {
    // CRITICAL: marked.use() is additive — calling it on the same instance
    // accumulates renderers/extensions forever, leaking memory and slowing
    // every subsequent parse(). Keep a bounded cache of fresh instances per
    // config so alternating row widths do not rebuild on every scroll frame.
    const instance = new Marked();

    const renderer = terminalRenderer(
      config.tokens,
      {
        reflowText: config.reflowText ?? true,
        width: config.width,
      },
      {},
    );

    const originalText = renderer.renderer.text;
    renderer.renderer.text = function (
      this: { parser?: { parseInline?: (tokens: unknown[]) => string } },
      text: string | { tokens?: unknown[] },
    ) {
      if (
        typeof text === "object" &&
        text.tokens &&
        Array.isArray(text.tokens) &&
        text.tokens.length > 0 &&
        this.parser?.parseInline
      ) {
        return this.parser.parseInline(text.tokens);
      }
      return originalText.call(this, text);
    } as typeof renderer.renderer.text;

    instance.use(renderer);
    return instance;
  }
}

export const markdownProvider = MarkdownProvider.getInstance();
// Re-export `marked` so callers needing the global singleton (none today)
// still resolve. Internal users should go through markdownProvider.
export { marked };
