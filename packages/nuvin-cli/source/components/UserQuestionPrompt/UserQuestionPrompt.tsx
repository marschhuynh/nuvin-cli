import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
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
  const [otherInput, setOtherInput] = useState('');
  const [showOtherInput, setShowOtherInput] = useState(false);

  const currentQuestion = questionData.questions[currentQuestionIndex];

  const handleSelectOption = useCallback(
    (optionIndex: number) => {
      if (currentQuestion.multiSelect) {
        const newSelected = new Set(selectedOptions);
        if (newSelected.has(optionIndex)) {
          newSelected.delete(optionIndex);
        } else {
          newSelected.add(optionIndex);
        }
        setSelectedOptions(newSelected);
      } else {
        setSelectedOptions(new Set([optionIndex]));
      }
    },
    [currentQuestion.multiSelect, selectedOptions]
  );

  const handleSubmitCurrent = useCallback(() => {
    let answer: string | string[];
    
    if (showOtherInput) {
      answer = otherInput.trim();
    } else if (currentQuestion.multiSelect) {
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
      setShowOtherInput(false);
      setOtherInput('');
    } else {
      // Submit all answers
      handleQuestionResponse(newAnswers);
    }
  }, [
    currentQuestion,
    currentQuestionIndex,
    selectedOptions,
    showOtherInput,
    otherInput,
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

      {!showOtherInput ? (
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
          <Box>
            <Text dimColor>○ Other (custom input)</Text>
          </Box>
        </Box>
      ) : (
        <Box>
          <Text>Other: </Text>
          <TextInput value={otherInput} onChange={setOtherInput} onSubmit={handleSubmitCurrent} />
        </Box>
      )}

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
