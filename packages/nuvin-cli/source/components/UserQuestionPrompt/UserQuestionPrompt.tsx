import { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { useUserQuestion } from '@/contexts/UserQuestionContext.js';

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
  const { handleQuestionResponse } = useUserQuestion();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [selectedOptions, setSelectedOptions] = useState<Set<number>>(new Set());

  const currentQuestion = questionData.questions[currentQuestionIndex];

  const handleSubmitCurrent = useCallback(() => {
    let answer: string | string[];
    
    if (currentQuestion.multiSelect) {
      answer = Array.from(selectedOptions).map(idx => currentQuestion.options[idx].label);
    } else {
      const selectedIdx = Array.from(selectedOptions)[0];
      answer = currentQuestion.options[selectedIdx].label;
    }

    const newAnswers = { ...answers, [currentQuestion.id]: answer };
    setAnswers(newAnswers);

    if (currentQuestionIndex < questionData.questions.length - 1) {
      // Move to next question
      setCurrentQuestionIndex(currentQuestionIndex + 1);
      setSelectedOptions(new Set());
    } else {
      // Submit all answers
      handleQuestionResponse(newAnswers);
    }
  }, [
    currentQuestion,
    currentQuestionIndex,
    selectedOptions,
    answers,
    questionData.questions.length,
    handleQuestionResponse,
  ]);

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
