import type { ToolDefinition } from '../ports.js';
import { ErrorReason } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { okJson, err } from './result-helpers.js';
import type { WebSearchMetadata } from './tool-result-metadata.js';

/**
 * WebSearchTool — Google Programmable Search Engine (CSE) ONLY
 * -----------------------------------------------------------------
 * - Requires env: GOOGLE_CSE_KEY, GOOGLE_CSE_CX
 * - Supports: count (1..50, paginated 10/req), offset (0-based), domains[] -> site:
 *             recencyDays -> dateRestrict, lang (hl/lr), region (gl), safe, type: web|images
 * - No HTML scraping fallback. If keys are missing, returns an error.
 */

export interface WebSearchParams {
  query: string;
  count?: number; // 1..50 (CSE returns up to 10 per request)
  offset?: number; // 0-based -> start = offset + 1
  domains?: string[]; // translates to (site:domain1 OR site:domain2 ...)
  recencyDays?: number; // maps to dateRestrict (dN/mN/yN)
  lang?: string; // e.g., 'en', 'vi' (maps to hl + lr)
  region?: string; // e.g., 'US', 'VN' (maps to gl)
  safe?: boolean; // default true -> safe=active
  type?: 'web' | 'images'; // default web; images uses searchType=image
  hydrateMeta?: boolean; // optionally fetch result pages to refine title/snippet
}

export interface WebSearchResult {
  title: string;
  url: string;
  snippet?: string;
  displayUrl?: string;
  favicon?: string;
  publishedAt?: string;
  source: {
    engine: 'google-cse';
    rank: number;
  };
}

export type WebSearchSuccessResult = {
  status: 'success';
  type: 'json';
  result: {
    engine: 'google-cse';
    count: number;
    items: WebSearchResult[];
    query: string;
    appliedFilters?: {
      domains?: string[];
      recencyDays?: number;
      lang?: string;
      region?: string;
    };
  };
  metadata?: WebSearchMetadata;
};

export type WebSearchToolResult = WebSearchSuccessResult | ExecResultError;

// ------------------------- Helpers -----------------------------------------

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 NuvinBot/1.0';

function withTimeout<T>(p: Promise<T>, ms = 15000, externalSignal?: AbortSignal): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);

  const abortHandler = () => ctrl.abort();
  externalSignal?.addEventListener('abort', abortHandler);

  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      ctrl.signal.addEventListener('abort', () => {
        const abortedByUser = externalSignal?.aborted;
        rej(new Error(abortedByUser ? 'Request aborted by user' : `Request timeout after ${ms}ms`));
      }),
    ),
  ]).finally(() => {
    clearTimeout(t);
    externalSignal?.removeEventListener('abort', abortHandler);
  });
}

async function fetchJSON<T>(input: RequestInfo, init?: RequestInit, signal?: AbortSignal): Promise<T> {
  const res = await withTimeout(fetch(input, { ...init, signal }), 15000, signal);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${body?.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

async function fetchText(input: RequestInfo, init?: RequestInit, signal?: AbortSignal): Promise<string> {
  const res = await withTimeout(fetch(input, { ...init, signal }), 15000, signal);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${body?.slice(0, 200)}`);
  }
  return await res.text();
}

function addSiteFilters(q: string, domains?: string[]): string {
  if (!domains?.length) return q.trim();
  const parts = domains.map((d) => `(site:${d})`);
  return `${q} ${parts.join(' OR ')}`.trim();
}

function normalizeUrl(u: string): string {
  try {
    const url = new URL(u);
    [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_term',
      'utm_content',
      'gclid',
      'fbclid',
      'mc_cid',
      'mc_eid',
    ].forEach((k) => url.searchParams.delete(k));
    return url.toString();
  } catch {
    return u;
  }
}

function cseDateRestrict(days?: number): string | undefined {
  if (!days || days <= 0) return undefined;
  if (days <= 30) return `d${Math.max(1, Math.floor(days))}`; // past N days
  if (days <= 365) return `m${Math.ceil(days / 30)}`; // months
  return `y${Math.ceil(days / 365)}`; // years
}

type CheerioElement = {
  text(): string;
  first(): CheerioElement;
  attr(name: string): string | undefined;
};

type CheerioAPI = {
  (selector: string): CheerioElement;
};

type CheerioLoad = (html: string) => CheerioAPI;

async function loadCheerio(): Promise<CheerioLoad | null> {
  try {
    const { load } = await import('cheerio');
    return load as CheerioLoad;
  } catch {
    return null;
  }
}

async function hydrate(results: WebSearchResult[], lang?: string, signal?: AbortSignal): Promise<WebSearchResult[]> {
  const limited = results.slice(0, 10);
  const enriched = await Promise.all(
    limited.map(async (r) => {
      try {
        const html = await fetchText(
          r.url,
          {
            headers: { 'User-Agent': UA, 'Accept-Language': lang || 'en', Accept: 'text/html' },
          },
          signal,
        );
        const load = await loadCheerio();
        if (!load) return r;
        const $ = load(html);
        const title = $("meta[property='og:title']").attr('content') || $('title').first().text().trim() || r.title;
        const desc =
          $("meta[name='description']").attr('content') ||
          $("meta[property='og:description']").attr('content') ||
          r.snippet;
        const published =
          $("meta[property='article:published_time']").attr('content') ||
          $('time[datetime]').attr('datetime') ||
          r.publishedAt;
        const canonical = $("link[rel='canonical']").attr('href');
        return {
          ...r,
          title: title || r.title,
          snippet: desc || r.snippet,
          url: canonical ? normalizeUrl(new URL(canonical, r.url).toString()) : r.url,
          publishedAt: published || r.publishedAt,
        } as WebSearchResult;
      } catch {
        return r;
      }
    }),
  );
  const byUrl = new Map(enriched.map((e) => [e.url, e]));
  return results.map((r) => byUrl.get(r.url) || r);
}

// ------------------------- Provider (CSE only) ------------------------------

interface Provider {
  name: 'google-cse';
  search(params: Required<WebSearchParams>, signal?: AbortSignal): Promise<WebSearchResult[]>;
}

class GoogleCseProvider implements Provider {
  name = 'google-cse' as const;

  async search(p: Required<WebSearchParams>, signal?: AbortSignal): Promise<WebSearchResult[]> {
    if (signal?.aborted) {
      throw new Error('Search aborted by user');
    }
    const key = process.env.GOOGLE_CSE_KEY;
    const cx = process.env.GOOGLE_CSE_CX; // Programmable Search Engine ID
    if (!key || !cx) throw new Error('Missing GOOGLE_CSE_KEY and/or GOOGLE_CSE_CX');

    const wanted = Math.max(1, Math.min(50, p.count));
    let fetched = 0;
    let start = (p.offset || 0) + 1; // 1-based start index

    const dateRestrict = cseDateRestrict(p.recencyDays);
    const q = addSiteFilters(p.query, p.domains);

    const out: WebSearchResult[] = [];

    while (fetched < wanted) {
      const num = Math.min(10, wanted - fetched);
      const url = new URL('https://www.googleapis.com/customsearch/v1');
      url.searchParams.set('key', key);
      url.searchParams.set('cx', cx);
      url.searchParams.set('q', q);
      url.searchParams.set('num', String(num));
      url.searchParams.set('start', String(start));
      url.searchParams.set('safe', p.safe ? 'active' : 'off');
      if (p.lang) {
        url.searchParams.set('hl', p.lang);
        url.searchParams.set('lr', `lang_${p.lang}`); // try to bias result language
      }
      if (p.region) url.searchParams.set('gl', p.region.toUpperCase());
      if (p.type === 'images') url.searchParams.set('searchType', 'image');
      if (dateRestrict) url.searchParams.set('dateRestrict', dateRestrict);

      interface CseResponse {
        items?: Array<{
          link?: string;
          title?: string;
          snippet?: string;
          htmlSnippet?: string;
          pagemap?: {
            metatags?: Array<{
              'article:published_time'?: string;
              'og:updated_time'?: string;
            }>;
          };
          image?: {
            contextLink?: string;
            title?: string;
          };
        }>;
      }

      const data = await fetchJSON<CseResponse>(
        url.toString(),
        {
          headers: { 'User-Agent': UA, Accept: 'application/json' },
        },
        signal,
      );

      const items = data.items || [];
      if (!items.length) break;

      const rankBase = fetched;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const link: string = it.link || it.image?.contextLink || '';
        const title: string = it.title || it.image?.title || '';
        const snippet: string | undefined = it.snippet || it.htmlSnippet?.replace(/<[^>]+>/g, '');
        const pagemap = it.pagemap || {};
        const mt = pagemap.metatags?.[0] || {};
        const published = mt['article:published_time'] || mt['og:updated_time'] || undefined;
        const displayUrl = (() => {
          try {
            return new URL(link).host;
          } catch {
            return undefined;
          }
        })();
        out.push({
          title,
          url: normalizeUrl(link),
          snippet,
          displayUrl,
          favicon: undefined,
          publishedAt: published,
          source: { engine: this.name, rank: rankBase + i + 1 },
        });
      }

      fetched += items.length;
      start += items.length;
      if (items.length < num) break; // no more pages
    }

    return out.slice(0, wanted);
  }
}

// ------------------------- Tool --------------------------------------------

export class WebSearchTool implements FunctionTool<WebSearchParams, ToolExecutionContext, WebSearchToolResult> {
  name = 'web_search' as const;

  parameters = {
    type: 'object',
    properties: {
      description: {
        type: 'string',
        description:
          'Explanation of what is being searched for and why (e.g., "Search for React hooks best practices")',
      },
      query: { type: 'string', description: 'Search the web for this query' },
      count: { type: 'number', description: 'Return this many search results (1-50, default 10)' },
      offset: { type: 'number', description: 'Skip this many results before returning (pagination)' },
      domains: { type: 'array', items: { type: 'string' }, description: 'Only search within these domains' },
      recencyDays: { type: 'number', description: 'Only return results from the last N days' },
      lang: { type: 'string', description: "Return results in this language, e.g. 'en', 'vi'" },
      region: { type: 'string', description: "Return results from this region, e.g. 'US', 'VN'" },
      safe: { type: 'boolean', description: 'Enable safe search filtering (default true)' },
      type: { type: 'string', enum: ['web', 'images'], description: 'Search for web pages or images (default web)' },
      hydrateMeta: { type: 'boolean', description: 'Fetch additional metadata from result pages (slower)' },
    },
    required: ['query'],
  } as const;

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: 'Google Programmable Search Engine only (no scraping). Requires GOOGLE_CSE_KEY and GOOGLE_CSE_CX.',
      parameters: this.parameters,
    };
  }

  private provider: Provider = new GoogleCseProvider();

  /**
   * Execute web search using Google Programmable Search Engine
   *
   * @param params - Search query and optional filters (domains, recency, language, region)
   * @param ctx - Execution context with optional abort signal
   * @returns Structured JSON with search results including title, URL, snippet, and metadata
   *
   * @example
   * ```typescript
   * const result = await webSearchTool.execute({
   *   query: 'TypeScript discriminated unions',
   *   count: 10,
   *   lang: 'en'
   * });
   * if (result.status === 'success' && result.type === 'json') {
   *   console.log(result.result.count); // number of results
   *   result.result.items.forEach(item => {
   *     console.log(`${item.title}: ${item.url}`);
   *   });
   * }
   * ```
   */
  async execute(params: WebSearchParams, ctx?: ToolExecutionContext): Promise<WebSearchToolResult> {
    if (ctx?.signal?.aborted) {
      return err('Search aborted by user', undefined, ErrorReason.Aborted);
    }
    const query = typeof params.query === 'string' ? params.query : '';
    if (!query) {
      return err('Missing required parameter: query', undefined, ErrorReason.InvalidInput);
    }

    const p: Required<WebSearchParams> = {
      query: String(params.query ?? '').trim(),
      count: Math.max(1, Math.min(50, Number(params.count ?? 10))),
      offset: Math.max(0, Number(params.offset ?? 0)),
      domains: params.domains || [],
      recencyDays: params.recencyDays ?? 0,
      lang: params.lang || 'en',
      region: params.region || '',
      safe: params.safe ?? true,
      type: params.type ?? 'web',
      hydrateMeta: params.hydrateMeta ?? false,
    };

    if (!p.query) {
      return err("Missing 'query'", undefined, ErrorReason.InvalidInput);
    }

    if (!process.env.GOOGLE_CSE_KEY || !process.env.GOOGLE_CSE_CX) {
      return err('GOOGLE_CSE_KEY and GOOGLE_CSE_CX are required for this tool (Google CSE only).', undefined, ErrorReason.InvalidInput);
    }

    try {
      let results = await this.provider.search(p, ctx?.signal);

      if (p.hydrateMeta && results.length) {
        results = await hydrate(results, p.lang, ctx?.signal);
      }

      const seen = new Set<string>();
      results = results
        .filter((r) => {
          const k = r.url.toLowerCase();
          if (!k || seen.has(k)) return false;
          seen.add(k);
          return true;
        })
        .slice(0, p.count);

      const appliedFilters: WebSearchSuccessResult['result']['appliedFilters'] = {};
      if (p.domains.length > 0) appliedFilters.domains = p.domains;
      if (p.recencyDays > 0) appliedFilters.recencyDays = p.recencyDays;
      if (p.lang && p.lang !== 'en') appliedFilters.lang = p.lang;
      if (p.region) appliedFilters.region = p.region;

      return okJson({
        engine: this.provider.name as 'google-cse',
        count: results.length,
        items: results,
        query: p.query,
        appliedFilters: Object.keys(appliedFilters).length > 0 ? appliedFilters : undefined,
      }, {
        offset: p.offset,
        totalRequested: p.count,
        hydrated: p.hydrateMeta,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      const isAborted = message.includes('aborted by user');
      return err(
        isAborted ? 'Search aborted by user' : message.slice(0, 500), 
        undefined, 
        isAborted ? ErrorReason.Aborted : ErrorReason.Unknown
      );
    }
  }
}
