import chalk from 'chalk';
import ansiEscapes from 'ansi-escapes';
import { stdout as supportsHyperlinksStdout } from 'supports-hyperlinks';

import type {
  RendererOptions,
  HighlightOptions,
  InternalRendererOptions,
  MarkedToken,
  RendererExtension,
  StyleFunction,
  MarkedParser,
  MarkedOptions,
} from './renderer-types.js';
import { compose, identity, sanitizeTab, textLength, unescapeEntities, fixHardReturn } from './text-utils.js';
import { insertEmojis, undoColon, COLON_REPLACER } from './emoji-processor.js';
import { TABLE_CELL_SPLIT, TABLE_ROW_WRAP, createTable } from './table-renderer.js';
import { formatList, fixNestedLists, indentLines, BULLET_POINT } from './list-renderer.js';
import { reflowText, indent, hr, section } from './text-reflow.js';
import { highlight } from './code-highlighter.js';

const defaultOptions: InternalRendererOptions = {
  code: chalk.yellow as StyleFunction,
  blockquote: chalk.gray.italic as StyleFunction,
  html: chalk.gray as StyleFunction,
  heading: chalk.green.bold as StyleFunction,
  firstHeading: chalk.magenta.underline.bold as StyleFunction,
  hr: chalk.reset as StyleFunction,
  listitem: chalk.reset as StyleFunction,
  list: formatList,
  table: chalk.reset as StyleFunction,
  paragraph: chalk.reset as StyleFunction,
  strong: chalk.bold as StyleFunction,
  em: chalk.italic as StyleFunction,
  codespan: chalk.yellow as StyleFunction,
  del: chalk.dim.gray.strikethrough as StyleFunction,
  link: chalk.blue as StyleFunction,
  href: chalk.blue.underline as StyleFunction,
  text: identity,
  image: undefined,
  unescape: true,
  emoji: true,
  width: 80,
  showSectionPrefix: true,
  reflowText: false,
  tab: 4,
  tableOptions: {},
};

class Renderer {
  private o: InternalRendererOptions;
  private tab: string;
  private tableSettings: Record<string, unknown>;
  private emojiTransform: (text: string) => string;
  private unescapeTransform: (text: string) => string;
  private highlightOptions: HighlightOptions;
  private transform: (text: string) => string;
  public options!: MarkedOptions;
  public parser!: MarkedParser;

  constructor(options?: RendererOptions, highlightOptions?: HighlightOptions) {
    const mergedOptions = { ...defaultOptions, ...options };
    this.tab = sanitizeTab(mergedOptions.tab, 4);
    this.o = mergedOptions as InternalRendererOptions;
    this.tableSettings = this.o.tableOptions;
    this.emojiTransform = this.o.emoji ? insertEmojis : identity;
    this.unescapeTransform = this.o.unescape ? unescapeEntities : identity;
    this.highlightOptions = highlightOptions || {};

    this.transform = compose(undoColon, this.unescapeTransform, this.emojiTransform);
  }

  textLength(str: string): number {
    return textLength(str);
  }

  space(): string {
    return '';
  }

  text(text: string | { text: string; tokens?: MarkedToken[] }): string {
    if (typeof text === 'object') {
      if (text.tokens && Array.isArray(text.tokens) && text.tokens.length > 0 && this.parser?.parseInline) {
        return this.parser.parseInline(text.tokens);
      }
      text = text.text;
    }
    return this.o.text(text);
  }

  code(code: string | { text: string; lang?: string; escaped?: boolean }, lang?: string, _escaped?: boolean): string {
    if (typeof code === 'object') {
      lang = code.lang;
      // const escaped = !!code.escaped; // unused
      code = code.text;
    }
    return section(indent(this.tab, highlight(code, lang, this.o.code, this.o.reflowText, this.highlightOptions)));
  }

  blockquote(quote: string | { tokens: MarkedToken[] }): string {
    let quoteText: string;
    if (typeof quote === 'object') {
      quoteText = this.parser.parse(quote.tokens);
    } else {
      quoteText = quote;
    }
    return section(this.o.blockquote(indent(this.tab, quoteText.trim())));
  }

  html(html: string | { text: string }): string {
    if (typeof html === 'object') {
      html = html.text;
    }
    return this.o.html(html);
  }

  heading(text: string | { depth: number; tokens: MarkedToken[] }, level?: number): string {
    let headingText: string;
    if (typeof text === 'object') {
      level = text.depth;
      headingText = this.parser.parseInline(text.tokens);
    } else {
      headingText = text;
    }
    headingText = this.transform(headingText);

    const prefix = this.o.showSectionPrefix ? `${new Array((level || 1) + 1).join('#')} ` : '';
    headingText = prefix + headingText;
    if (this.o.reflowText) {
      headingText = reflowText(headingText, this.o.width, this.options.gfm);
    }
    return section(level === 1 ? this.o.firstHeading(headingText) : this.o.heading(headingText));
  }

  hr(): string {
    return section(this.o.hr(hr('-', this.o.reflowText && this.o.width)));
  }

  list(body: string | { ordered: boolean; items: MarkedToken[] }, ordered?: boolean): string {
    let listBody: string;
    if (typeof body === 'object') {
      const listToken = body;
      ordered = listToken.ordered;
      listBody = '';
      for (let j = 0; j < listToken.items.length; j++) {
        listBody += this.listitem(listToken.items[j]);
      }
    } else {
      listBody = body;
    }
    listBody = this.o.list(listBody, !!ordered, this.tab);
    let formatted = fixNestedLists(indentLines(this.tab, listBody), this.tab);
    formatted = formatted
      .split('\n')
      .filter((line) => this.textLength(line.trim()) > 0)
      .join('\n');
    return `${formatted}\n\n`;
  }

  listitem(text: string | MarkedToken): string {
    if (typeof text === 'object') {
      const item = text;
      text = '';
      if (item.task) {
        const checkbox = this.checkbox({ checked: !!item.checked });
        if (item.loose) {
          if (item.tokens && item.tokens.length > 0 && item.tokens[0].type === 'paragraph') {
            item.tokens[0].text = `${checkbox} ${item.tokens[0].text}`;
            if (item.tokens[0].tokens && item.tokens[0].tokens.length > 0 && item.tokens[0].tokens[0].type === 'text') {
              item.tokens[0].tokens[0].text = `${checkbox} ${item.tokens[0].tokens[0].text}`;
            }
          } else {
            item.tokens = item.tokens || [];
            item.tokens.unshift({
              type: 'text',
              raw: `${checkbox} `,
              text: `${checkbox} `,
            });
          }
        } else {
          text += `${checkbox} `;
        }
      }

      text += this.parser.parse(item.tokens || [], !!item.loose);
    }

    const lines = text.split('\n');
    const filteredLines = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (this.textLength(line.trim()) > 0) {
        filteredLines.push(line);
      }
    }
    text = filteredLines.join('\n').trim();

    const transform = compose(this.o.listitem, this.transform);

    return `\n${BULLET_POINT}${transform(text)}`;
  }

  checkbox(checked: boolean | { checked: boolean }): string {
    if (typeof checked === 'object') {
      checked = checked.checked;
    }
    return `[${checked ? 'X' : ' '}] `;
  }

  paragraph(text: string | { tokens: MarkedToken[] }): string {
    let paragraphText: string;
    if (typeof text === 'object') {
      paragraphText = this.parser.parseInline(text.tokens);
    } else {
      paragraphText = text;
    }
    const transform = compose(this.o.paragraph, this.transform);
    paragraphText = transform(paragraphText);
    if (this.o.reflowText) {
      paragraphText = reflowText(paragraphText, this.o.width, this.options.gfm);
    }
    return section(paragraphText);
  }

  table(header: string | { header: MarkedToken[]; rows: MarkedToken[][] }, body?: string): string {
    if (typeof header === 'object') {
      const token = header;
      header = '';

      let cell = '';
      for (let j = 0; j < token.header.length; j++) {
        cell += this.tablecell(token.header[j]);
      }
      header += this.tablerow({ text: cell });

      body = '';
      for (let j = 0; j < token.rows.length; j++) {
        const row = token.rows[j];
        cell = '';
        for (let k = 0; k < row.length; k++) {
          cell += this.tablecell(row[k]);
        }
        body += this.tablerow({ text: cell });
      }
    }
    return section(createTable(header, body || '', this.tableSettings, this.transform, this.o.table));
  }

  tablerow(content: string | { text: string }): string {
    if (typeof content === 'object') {
      content = content.text;
    }
    return `${TABLE_ROW_WRAP + content + TABLE_ROW_WRAP}\n`;
  }

  tablecell(content: string | MarkedToken): string {
    if (typeof content === 'object') {
      content = this.parser.parseInline(content.tokens || []);
    }
    return content + TABLE_CELL_SPLIT;
  }

  strong(text: string | { tokens: MarkedToken[] }): string {
    let strongText: string;
    if (typeof text === 'object') {
      strongText = this.parser.parseInline(text.tokens);
    } else {
      strongText = text;
    }
    return this.o.strong(strongText);
  }

  em(text: string | { tokens: MarkedToken[] }): string {
    let emText: string;
    if (typeof text === 'object') {
      emText = this.parser.parseInline(text.tokens);
    } else {
      emText = text;
    }
    emText = fixHardReturn(emText, this.o.reflowText);
    return this.o.em(emText);
  }

  codespan(text: string | { text: string }): string {
    if (typeof text === 'object') {
      text = text.text;
    }
    text = fixHardReturn(text, this.o.reflowText);
    return this.o.codespan(text.replace(/:/g, COLON_REPLACER));
  }

  br(): string {
    return this.o.reflowText ? '\r' : '\n';
  }

  del(text: string | { tokens: MarkedToken[] }): string {
    let delText: string;
    if (typeof text === 'object') {
      delText = this.parser.parseInline(text.tokens);
    } else {
      delText = text;
    }
    return this.o.del(delText);
  }

  link(href: string | { href: string; title?: string; tokens: MarkedToken[] }, _titleParam?: string, text?: string): string {
    if (typeof href === 'object') {
      text = this.parser.parseInline(href.tokens);
      href = href.href;
    }

    if (this.options.sanitize) {
      try {
        const prot = decodeURIComponent(unescape(href))
          .replace(/[^\w:]/g, '')
          .toLowerCase();
        if (prot.indexOf('javascript:') === 0) {
          return '';
        }
      } catch (_e) {
        return '';
      }
    }

    const hasText = text && text !== href;
    let out = '';

    if (supportsHyperlinksStdout) {
      let link = '';
      if (text) {
        link = this.o.href(this.emojiTransform(text));
      } else {
        link = this.o.href(href);
      }
      out = ansiEscapes.link(link, href.replace(/\+/g, '%20'));
    } else {
      if (hasText && text) out += `${this.emojiTransform(text)} (`;
      out += this.o.href(href);
      if (hasText) out += ')';
    }
    return this.o.link(out);
  }

  image(href: string | { href: string; title?: string; text: string }, title?: string, text?: string): string {
    let imageHref: string;
    let imageTitle: string | undefined;
    let imageText: string | undefined;

    if (typeof href === 'object') {
      imageTitle = href.title;
      imageText = href.text;
      imageHref = href.href;
    } else {
      imageHref = href;
      imageTitle = title;
      imageText = text;
    }

    if (this.o.image) {
      return this.o.image(imageHref, imageTitle, imageText);
    }
    let out = `![${imageText}`;
    if (imageTitle) out += ` – ${imageTitle}`;
    return `${out}](${imageHref})\n`;
  }
}

export function terminalRenderer(options?: RendererOptions, highlightOptions?: HighlightOptions): RendererExtension {
  const r = new Renderer(options, highlightOptions);

  const funcs: Array<keyof Renderer> = [
    'text',
    'code',
    'blockquote',
    'html',
    'heading',
    'hr',
    'list',
    'listitem',
    'checkbox',
    'paragraph',
    'table',
    'tablerow',
    'tablecell',
    'strong',
    'em',
    'codespan',
    'br',
    'del',
    'link',
    'image',
  ];

  return funcs.reduce<RendererExtension>(
    (extension, func) => {
      // biome-ignore lint/suspicious/noExplicitAny: marked library requires dynamic method signatures
      extension.renderer[func as string] = function (this: any, ...args: unknown[]) {
        r.options = this.options;
        r.parser = this.parser;
        const method = r[func];
        if (typeof method === 'function') {
          // biome-ignore lint/suspicious/noExplicitAny: dynamic method invocation from marked
          return (method as any).apply(r, args);
        }
        return '';
      // biome-ignore lint/suspicious/noExplicitAny: marked library type compatibility
      } as any;
      return extension;
    },
    { renderer: {}, useNewRenderer: true },
  );
}
