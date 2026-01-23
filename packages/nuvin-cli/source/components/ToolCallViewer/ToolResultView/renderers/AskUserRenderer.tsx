import type React from 'react';
import { Box, Text } from 'ink';
import type { ToolExecutionResult, AskUserMetadata, ToolCall } from '@nuvin/nuvin-core';
import { parseToolArguments } from '@nuvin/nuvin-core';
import { useTheme } from '@/contexts/ThemeContext.js';

type AskUserRendererProps = {
  toolResult: ToolExecutionResult;
  toolCall?: ToolCall;
  messageId?: string;
  fullMode?: boolean;
  cols: number;
};

export const AskUserRenderer: React.FC<AskUserRendererProps> = ({ toolResult, toolCall, messageId, cols }) => {
  const { theme } = useTheme();
  const metadata = toolResult.metadata as AskUserMetadata | undefined;

  if (!metadata?.answers || Object.keys(metadata.answers).length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor color={theme.colors.muted}>
          Waiting for user response...
        </Text>
      </Box>
    );
  }

  // Get questions from toolCall arguments
  const args = toolCall ? parseToolArguments(toolCall.function.arguments) : null;
  const questions = (args && 'questions' in args ? args.questions : []) as Array<{
    question: string;
    header: string;
    multiSelect: boolean;
  }>;

  const answers = metadata.answers;

  return (
    <Box flexDirection="column" width={cols - 10}>
      {questions.map((q, idx) => {
        const qId = `q${idx}`;
        const answer = answers[qId];
        const displayAnswer = Array.isArray(answer) ? answer.join(', ') : answer;

        return (
          <Box key={`${messageId}-qa-${idx}`} flexDirection="column">
            <Text dimColor>
              <Text bold color={theme.tokens.blue}>{q.header}:</Text> {q.question}
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
};
