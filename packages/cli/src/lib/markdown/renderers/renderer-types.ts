export type StyleFunction = (text: string) => string;

export type RendererOptions = {
  code?: StyleFunction;
  blockquote?: StyleFunction;
  html?: StyleFunction;
  heading?: StyleFunction;
  firstHeading?: StyleFunction;
  hr?: StyleFunction;
  listitem?: StyleFunction;
  list?: (body: string, ordered: boolean, indent: string) => string;
  table?: StyleFunction;
  paragraph?: StyleFunction;
  strong?: StyleFunction;
  em?: StyleFunction;
  codespan?: StyleFunction;
  del?: StyleFunction;
  link?: StyleFunction;
  href?: StyleFunction;
  text?: StyleFunction;
  image?: (href: string, title?: string, text?: string) => string;
  unescape?: boolean;
  emoji?: boolean;
  width?: number;
  showSectionPrefix?: boolean;
  reflowText?: boolean;
  tab?: number | string;
  tableOptions?: Record<string, unknown>;
};

export type HighlightOptions = Record<string, unknown>;

export interface MarkedToken {
  type?: string;
  text?: string;
  raw?: string;
  tokens?: MarkedToken[];
  task?: boolean;
  checked?: boolean;
  loose?: boolean;
  ordered?: boolean;
  items?: MarkedToken[];
  depth?: number;
  lang?: string;
  escaped?: boolean;
  header?: MarkedToken[];
  rows?: MarkedToken[][];
  href?: string;
  title?: string;
  [key: string]: unknown;
}

export interface MarkedParser {
  parse(tokens: MarkedToken[], loose?: boolean): string;
  parseInline(tokens: MarkedToken[]): string;
}

export interface MarkedOptions {
  sanitize?: boolean;
  gfm?: boolean;
  [key: string]: unknown;
}

export type InternalRendererOptions = {
  code: StyleFunction;
  blockquote: StyleFunction;
  html: StyleFunction;
  heading: StyleFunction;
  firstHeading: StyleFunction;
  hr: StyleFunction;
  listitem: StyleFunction;
  list: (body: string, ordered: boolean, indent: string) => string;
  table: StyleFunction;
  paragraph: StyleFunction;
  strong: StyleFunction;
  em: StyleFunction;
  codespan: StyleFunction;
  del: StyleFunction;
  link: StyleFunction;
  href: StyleFunction;
  text: StyleFunction;
  image?: (href: string, title?: string, text?: string) => string;
  unescape: boolean;
  emoji: boolean;
  width: number;
  showSectionPrefix: boolean;
  reflowText: boolean;
  tab: number;
  tableOptions: Record<string, unknown>;
};

export interface RendererExtension {
  renderer: Record<string, (...args: unknown[]) => unknown>;
  useNewRenderer: boolean;
}

export interface RendererContext {
  options: MarkedOptions;
  parser: MarkedParser;
}
