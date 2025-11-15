import { marked } from 'marked';
import { terminalRenderer } from '@/renderers/terminal-renderer.js';

type RendererConfig = {
  width: number;
  reflowText?: boolean;
};

class MarkdownProvider {
  private static instance: MarkdownProvider;
  private markedInstance: typeof marked;
  private currentConfig: RendererConfig | null = null;

  private constructor() {
    this.markedInstance = marked;
  }

  static getInstance(): MarkdownProvider {
    if (!MarkdownProvider.instance) {
      MarkdownProvider.instance = new MarkdownProvider();
    }
    return MarkdownProvider.instance;
  }

  getRenderer(config: RendererConfig): typeof marked {
    if (
      !this.currentConfig ||
      this.currentConfig.width !== config.width ||
      this.currentConfig.reflowText !== config.reflowText
    ) {
      this.configureRenderer(config);
      this.currentConfig = { ...config };
    }

    return this.markedInstance;
  }

  private configureRenderer(config: RendererConfig): void {
    const renderer = terminalRenderer(
      {
        reflowText: config.reflowText ?? true,
        width: config.width,
        hr: () => `\n${'⎼'.repeat(Math.min(config.width, 80))}\n`,
      },
      {},
    );

    const originalText = renderer.renderer.text;
    // biome-ignore lint/suspicious/noExplicitAny: marked library has complex internal types
    renderer.renderer.text = function (this: any, text: string | { tokens?: unknown[] }) {
      if (
        typeof text === 'object' &&
        text.tokens &&
        Array.isArray(text.tokens) &&
        text.tokens.length > 0 &&
        this.parser?.parseInline
      ) {
        return this.parser.parseInline(text.tokens);
      }
      return originalText.call(this, text);
    // biome-ignore lint/suspicious/noExplicitAny: marked library requires type assertion
    } as any;

    this.markedInstance.use(renderer);
  }
}

export const markdownProvider = MarkdownProvider.getInstance();
