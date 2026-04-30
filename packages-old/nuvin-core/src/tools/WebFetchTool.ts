import TurndownService from 'turndown';
import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { okText, err } from './result-helpers.js';
import type { WebFetchMetadata } from './tool-result-metadata.js';

export type WebFetchParams = {
  url: string;
};

export type WebFetchSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata: WebFetchMetadata;
};

export type WebFetchResult = WebFetchSuccessResult | ExecResultError;

export class WebFetchTool implements FunctionTool<WebFetchParams, ToolExecutionContext, WebFetchResult> {
  name = 'web_fetch';
  parameters = {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description:
          'Explanation of what web page is being fetched and why (e.g., "Fetch documentation page for API usage examples")',
      },
      url: { type: 'string', description: 'Fetch and convert this web page URL to Markdown' },
    },
    required: ['url'],
  } as const;

  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
      bulletListMarker: '-',
    });

    this.turndownService.remove(['script', 'style', 'noscript', 'iframe', 'nav', 'footer', 'header', 'aside']);
  }

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: 'Fetch web page content and convert to Markdown format',
      parameters: this.parameters,
    };
  }

  async execute(params: WebFetchParams, ctx?: ToolExecutionContext): Promise<WebFetchResult> {
    const target = String(params.url ?? '');

    if (!target) {
      return err('URL parameter is required', undefined, ErrorReason.InvalidInput);
    }

    if (ctx?.signal?.aborted) {
      return err('Fetch aborted by user', undefined, ErrorReason.Aborted);
    }

    try {
      const res = await fetch(target, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
        signal: ctx?.signal,
      });

      if (!res.ok) {
        return err(`HTTP ${res.status} ${res.statusText}`, { url: target }, ErrorReason.NetworkError);
      }

      const contentType = res.headers.get('content-type') || '';
      const text = await res.text();
      const fetchedAt = new Date().toISOString();

      let finalText: string;
      let format: 'markdown' | 'json' | 'text';

      if (contentType.includes('application/json')) {
        finalText = `\`\`\`json\n${text}\n\`\`\``;
        format = 'json';
      } else if (contentType.includes('text/html')) {
        finalText = this.turndownService.turndown(text);
        format = 'markdown';
      } else {
        finalText = text;
        format = 'text';
      }

      return okText(finalText, {
        url: target,
        contentType,
        statusCode: res.status,
        format,
        size: text.length,
        fetchedAt,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const isAborted = errorMessage.includes('aborted') || (error as Error).name === 'AbortError';
      return err(
        isAborted ? 'Fetch aborted by user' : errorMessage, 
        { url: target }, 
        isAborted ? ErrorReason.Aborted : ErrorReason.NetworkError
      );
    }
  }
}
