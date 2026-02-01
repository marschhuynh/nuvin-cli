import { Box, Text } from 'ink';
import type { AskUserMetadata } from '@nuvin/nuvin-core';
import { parseToolArguments } from '@nuvin/nuvin-core';
import type { ToolRenderContext, RenderFn } from '../types.js';
import { LAYOUT } from '../types.js';

type Question = {
  question: string;
  header: string;
  multiSelect?: boolean;
};

export const askUserRenderer = {
  result: ((ctx: ToolRenderContext) => {
    const { toolCall, toolResult, theme, cols } = ctx;
    const metadata = toolResult?.metadata as AskUserMetadata | undefined;

    if (!metadata?.answers || Object.keys(metadata.answers).length === 0) {
      return (
        <Box flexDirection="column" marginLeft={2}>
          <Text dimColor color={theme.colors.muted}>
            Waiting for user response...
          </Text>
        </Box>
      );
    }

    // Get questions from toolCall arguments
    const args = parseToolArguments(toolCall.function.arguments);
    const questions = (args && 'questions' in args ? args.questions : []) as Question[];

    const answers = metadata.answers;

    return (
      <Box flexDirection="column" marginLeft={2} width={cols - LAYOUT.CONTENT_MARGIN}>
        {questions.map((q, idx) => {
          const qId = `q${idx}`;
          const answer = answers[qId];
          const displayAnswer = Array.isArray(answer) ? answer.join(', ') : answer;

          return (
            <Box key={`qa-${idx}`} flexDirection="column">
              <Text dimColor>
                <Text bold color={theme.tokens.blue}>
                  {q.header}:
                </Text>{' '}
                {q.question}
              </Text>
              <Box marginLeft={2}>
                <Text color={theme.tokens.green}>→ {displayAnswer}</Text>
              </Box>
              {idx < questions.length - 1 && (
                <Box marginY={0}>
                  <Text>{' '}</Text>
                </Box>
              )}
            </Box>
          );
        })}
      </Box>
    );
  }) as RenderFn,
};
