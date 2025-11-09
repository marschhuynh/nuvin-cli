import type React from 'react';
import { useMemo, useCallback } from 'react';
import { Text } from 'ink';
import { markdownProvider } from '@/providers/MarkdownProvider.js';
import { markdownCache } from '@/utils/MarkdownCache.js';
import { useStdoutDimensions } from '@/hooks/index.js';

type MarkdownProps = {
	children: string;
	disableMarkdown?: boolean;
	enableCache?: boolean;
};

export const Markdown: React.FC<MarkdownProps> = ({
	children,
	disableMarkdown,
	enableCache = true,
}) => {
	const [cols] = useStdoutDimensions();

	const rendererConfig = useMemo(
		() => ({
			width: Math.max(20, cols - 10),
			reflowText: true,
		}),
		[cols],
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

				const trimmed = result.trim();

				if (enableCache) {
					markdownCache.set(content, configHash, trimmed);
				}

				return trimmed;
			} catch {
				return content;
			}
		},
		[rendererConfig, configHash, enableCache],
	);

	const renderedContent = useMemo(() => {
		if (disableMarkdown) {
			return children;
		}

		return parseMarkdown(children);
	}, [children, disableMarkdown, parseMarkdown]);

	return <Text>{renderedContent}</Text>;
};
