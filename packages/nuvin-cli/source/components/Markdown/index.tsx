import type React from 'react';
import { useMemo, useCallback } from 'react';
import { Text } from 'ink';
import { markdownProvider } from '@/providers/MarkdownProvider.js';
import { markdownCache } from '@/utils/markdownCache.js';
import { useStdoutDimensions } from '@/hooks/index.js';

type MarkdownProps = {
  children: string;
  disableMarkdown?: boolean;
  enableCache?: boolean;
  reflowText?: boolean;
  maxWidth?: number;
};

export const Markdown: React.FC<MarkdownProps> = ({
  children,
  disableMarkdown,
  enableCache = true,
  reflowText = false,
  maxWidth,
}) => {
  const { cols } = useStdoutDimensions();

  const rendererConfig = useMemo(
    () => ({
      width: maxWidth ?? cols - 8,
      reflowText,
    }),
    [cols, reflowText, maxWidth],
  );

  const configHash = useMemo(() => JSON.stringify(rendererConfig), [rendererConfig]);

  const parseMarkdown = useCallback(
    (content: string): string => {
      if (enableCache) {
        const cached = markdownCache.get(content, configHash);
        if (cached) {
          return cached;
        }
      }

      try {
        const renderer = markdownProvider.getRenderer(rendererConfig);
        const result = renderer.parse(content, {
          async: false,
          breaks: true,
          gfm: true,
        }) as string;

        if (enableCache) {
          markdownCache.set(content, configHash, result);
        }

        return result;
      } catch {
        return content;
      }
    },
    [rendererConfig, configHash, enableCache],
  );

  const renderedContent = useMemo(() => {
    if (disableMarkdown) {
      return children ?? '';
    }

    return parseMarkdown(children ?? '').trimEnd();
  }, [children, disableMarkdown, parseMarkdown]);

  return <Text wrap="wrap">{renderedContent}</Text>;
};
