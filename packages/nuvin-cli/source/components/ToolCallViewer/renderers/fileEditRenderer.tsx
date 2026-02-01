import { Box } from 'ink';
import type { ToolRenderContext, RenderFn } from '../types.js';
import { FileDiffView, type LineNumbers } from '@/components/FileDiffView.js';
import { getStateColor } from '../computeToolState.js';
import { LAYOUT } from '../types.js';

type FileEditMetadata = {
  path?: string;
  lineNumbers?: LineNumbers;
};

export const fileEditRenderer = {
  params: ((ctx: ToolRenderContext) => {
    const { args, theme, cols, toolState, toolResult } = ctx;

    // Only show diff if we have the necessary args
    if (args.old_text === undefined || args.new_text === undefined) {
      return null;
    }

    const color = getStateColor(toolState, theme);
    const metadata = toolResult?.metadata as FileEditMetadata | undefined;
    const lineNumbers = metadata?.lineNumbers;

    return (
      <Box
        flexDirection="column"
        marginLeft={2}
        borderStyle="single"
        borderDimColor
        borderColor={color}
        borderBottom={false}
        borderRight={false}
        borderTop={false}
        paddingLeft={2}
        width={cols - LAYOUT.PARAM_MARGIN}
      >
        <FileDiffView
          blocks={[{ search: args.old_text as string, replace: args.new_text as string }]}
          filePath={metadata?.path || (args.file_path as string)}
          showPath={false}
          lineNumbers={lineNumbers}
        />
      </Box>
    );
  }) as RenderFn,

  result: (() => null) as RenderFn, // No separate result for file_edit, diff is shown in params
};
