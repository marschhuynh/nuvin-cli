import { useState } from 'react';
import { Box, Text } from 'ink';

interface Props {
  questionData: {
    questionId: string;
    questions: Array<{
      id: string;
      question: string;
      header: string;
      options: Array<{
        label: string;
        description: string;
      }>;
      multiSelect: boolean;
    }>;
  };
}

function UserQuestionPromptContent({ questionData }: Props) {
  const [currentQuestionIndex] = useState(0);
  const [selectedOptions] = useState<Set<number>>(new Set());

  const currentQuestion = questionData.questions[currentQuestionIndex];

  return (
    <Box flexDirection="column" padding={1}>
      <Box marginBottom={1}>
        <Text bold color="cyan">
          Question {currentQuestionIndex + 1}/{questionData.questions.length}
        </Text>
        <Text dimColor> - {currentQuestion.header}</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>{currentQuestion.question}</Text>
      </Box>

      <Box flexDirection="column">
        {currentQuestion.options.map((option, idx) => (
          <Box key={idx} marginBottom={1}>
            <Text color={selectedOptions.has(idx) ? 'green' : undefined}>
              {selectedOptions.has(idx) ? '● ' : '○ '}
              {option.label}
            </Text>
            <Text dimColor> - {option.description}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>
          {currentQuestion.multiSelect
            ? 'Use arrow keys to select, space to toggle, enter to continue'
            : 'Use arrow keys to select, enter to choose'}
        </Text>
      </Box>
    </Box>
  );
}

export function UserQuestionPrompt({ questionData }: Props) {
  return (
    <Box>
      <UserQuestionPromptContent questionData={questionData} />
    </Box>
  );
}
