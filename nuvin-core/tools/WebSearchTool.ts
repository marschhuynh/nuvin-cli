import type {ToolDefinition} from '../ports';
import type {FunctionTool, ExecResult} from './types';

export class WebSearchTool implements FunctionTool<{query: string}> {
  name = 'web_search';
  parameters = {
    type: 'object',
    properties: {
      query: {type: 'string', description: 'Search query'},
    },
    required: ['query'],
  } as const;

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: 'Search Google and return the first 10 results',
      parameters: this.parameters,
    };
  }

  async execute(params: {query: string}): Promise<ExecResult> {
    const q = encodeURIComponent(String(params.query ?? ''));
    const url = `https://www.google.com/search?q=${q}`;
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NuvinBot/1.0; +https://github.com/nuvin-space)',
        },
      });
      const html = await res.text();
      const results: {title: string; link: string}[] = [];
      const regex = /<a href="\/url\?q=(https?:\/\/[^&]+)&amp;[^>]*><h3[^>]*>(.*?)<\/h3><\/a>/g;
      let match;
      while ((match = regex.exec(html)) && results.length < 10) {
        const link = decodeURIComponent(match[1]);
        const title = match[2].replace(/<[^>]+>/g, '');
        results.push({title, link});
      }
      return {status: 'success', type: 'json', result: results};
    } catch (error: any) {
      return {status: 'error', type: 'text', result: String(error)};
    }
  }
}

