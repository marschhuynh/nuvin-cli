import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MermaidDiagram } from './MermaidDiagram';
import { unwrapMarkdownBlocks } from '@/utils/markdown-utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  isStreaming?: boolean;
  depth?: number;
}

interface CodeBlockProps {
  children: React.ReactNode;
  className?: string;
  language?: string;
  content: string;
  depth?: number;
  isStreaming?: boolean;
}

function CodeBlock({
  children,
  className,
  language,
  content,
  isStreaming,
  depth = 0,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  // Handle special language types
  if (language === 'mermaid') {
    // During streaming, show mermaid as a code block instead of rendering the diagram
    if (isStreaming) {
      // Fall through to regular code block rendering
    } else {
      return <MermaidDiagram chart={content} />;
    }
  }

  if (language === 'markdown') {
    // Prevent infinite recursion by limiting nesting depth
    if (depth >= 3) {
      // Fall through to regular code block rendering
    } else {
      return (
        <div className="nested-markdown border border-border bg-muted/20 p-4 rounded-lg overflow-hidden">
          <div className="text-foreground text-sm font-medium mb-2 flex items-center justify-between">
            <span>Markdown Content:</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleCopy}
              className="h-6 w-6 p-0 hover:bg-muted"
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>
          </div>
          <MarkdownRenderer
            content={content}
            className="nested-markdown-content"
            isStreaming={isStreaming}
            depth={depth + 1}
          />
        </div>
      );
    }
  }

  // For inline code (no className means it's inline)
  if (!className) {
    return (
      <code className="bg-muted px-1.5 py-0.5 rounded text-sm font-mono text-foreground">
        {children}
      </code>
    );
  }

  // For code blocks with copy functionality
  return (
    <div className="relative group">
      <pre className="bg-muted/30 border border-border rounded-lg p-4 overflow-x-auto mb-3">
        <code className={`text-sm font-mono ${className || ''}`}>
          {children}
        </code>
      </pre>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleCopy}
        className="absolute top-2 right-2 h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-muted"
        title="Copy code"
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  );
}

export function MarkdownRenderer({
  content,
  className = '',
  isStreaming = false,
  depth = 0,
}: MarkdownRendererProps) {
  // Memoize content processing for performance
  const processedContent = useMemo(() => {
    return unwrapMarkdownBlocks(content.trim());
  }, [content]);

  // Memoize components for better performance
  const components = useMemo(
    () => ({
      // Enhanced code block component
      code: ({ children, className, ...props }: any) => {
        const match = /language-(\w+)/.exec(className || '');
        const language = match ? match[1] : '';
        const content = String(children).replace(/\n$/, '');

        return (
          <CodeBlock
            className={className}
            language={language}
            content={content}
            isStreaming={isStreaming}
            depth={depth}
            {...props}
          >
            {children}
          </CodeBlock>
        );
      },

      // Theme-aware headings with better hierarchy
      h1: ({ children }: any) => (
        <h1 className="text-2xl font-bold mb-4 pb-2 border-b border-border text-foreground whitespace-break-spaces">
          {children}
        </h1>
      ),
      h2: ({ children }: any) => (
        <h2 className="text-xl font-semibold mb-3 pb-1 border-b border-border/50 text-foreground whitespace-break-spaces">
          {children}
        </h2>
      ),
      h3: ({ children }: any) => (
        <h3 className="text-lg font-semibold mb-2 text-foreground whitespace-break-spaces">
          {children}
        </h3>
      ),
      h4: ({ children }: any) => (
        <h4 className="text-base font-semibold mb-2 text-foreground whitespace-break-spaces">
          {children}
        </h4>
      ),
      h5: ({ children }: any) => (
        <h5 className="text-sm font-semibold mb-2 text-foreground whitespace-break-spaces">
          {children}
        </h5>
      ),
      h6: ({ children }: any) => (
        <h6 className="text-xs font-semibold mb-2 text-muted-foreground whitespace-break-spaces">
          {children}
        </h6>
      ),

      // Enhanced paragraphs
      p: ({ children }: any) => (
        <p className="mb-4 leading-relaxed text-foreground">{children}</p>
      ),

      // Improved lists with theme-aware styling
      ul: ({ children }: any) => (
        <ul className="mb-4 space-y-1 pl-6 list-disc marker:text-muted-foreground">
          {children}
        </ul>
      ),
      ol: ({ children }: any) => (
        <ol className="mb-4 space-y-1 pl-6 list-decimal marker:text-muted-foreground">
          {children}
        </ol>
      ),
      li: ({ children }: any) => (
        <li className="leading-relaxed text-foreground">{children}</li>
      ),

      // Theme-aware blockquotes
      blockquote: ({ children }: any) => (
        <blockquote className="border-l-4 border-primary pl-4 mb-4 italic text-muted-foreground bg-muted/20 py-2 rounded-r-md">
          {children}
        </blockquote>
      ),

      // Enhanced tables with theme support
      table: ({ children }: any) => (
        <div className="overflow-x-auto mb-4 rounded-lg border border-border">
          <table className="min-w-full">{children}</table>
        </div>
      ),
      thead: ({ children }: any) => (
        <thead className="bg-muted/30">{children}</thead>
      ),
      tbody: ({ children }: any) => (
        <tbody className="divide-y divide-border">{children}</tbody>
      ),
      tr: ({ children }: any) => (
        <tr className="hover:bg-muted/10 transition-colors">{children}</tr>
      ),
      th: ({ children }: any) => (
        <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {children}
        </th>
      ),
      td: ({ children }: any) => (
        <td className="px-4 py-3 text-sm text-foreground">{children}</td>
      ),

      // Enhanced links with better hover states
      a: ({ href, children }: any) => (
        <a
          href={href}
          className="text-primary hover:text-primary/80 underline underline-offset-2 decoration-primary/50 hover:decoration-primary transition-colors"
          target="_blank"
          rel="noopener noreferrer"
        >
          {children}
        </a>
      ),

      // Theme-aware horizontal rules
      hr: () => <hr className="my-8 border-border" />,

      // Enhanced emphasis
      strong: ({ children }: any) => (
        <strong className="font-semibold text-foreground">{children}</strong>
      ),
      em: ({ children }: any) => (
        <em className="italic text-foreground/90">{children}</em>
      ),
    }),
    [isStreaming, depth],
  );

  return (
    <div className={`markdown-content prose prose-sm max-w-none ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
