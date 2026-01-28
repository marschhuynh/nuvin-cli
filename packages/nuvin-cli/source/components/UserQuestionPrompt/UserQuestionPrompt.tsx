import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Box, Text } from 'ink';
import { useInput } from '@/contexts/InputContext/index.js';
import { useUserQuestion } from '@/contexts/UserQuestionContext.js';
import { AppModal } from '@/components/AppModal.js';
import { HelpText } from '@/components/HelpText.js';
import { FocusProvider, useFocus, useFocusCycle } from '@/contexts/InputContext/FocusContext.js';
import TextInput from '@/components/TextInput/index.js';
import { theme } from '@/theme.js';
import { TextWrapper } from '../TextWrapper';
import { Button } from '@/components/Button.js';

const FOCUS_ID = {
  OPTION: (idx: number) => `question-option-${idx}`,
  OTHER: 'question-other',
  SUBMIT: 'question-submit',
} as const;

function parseFocusedIndex(focusedId: string | null): number | null {
  if (!focusedId) return null;
  if (focusedId === FOCUS_ID.OTHER) return null;
  if (focusedId === FOCUS_ID.SUBMIT) return null;
  const match = focusedId.match(/^question-option-(\d+)$/);
  if (match) return parseInt(match[1], 10);
  return null;
}

interface QuestionOption {
  label: string;
  description: string;
}

interface Question {
  id: string;
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

interface Props {
  questionData: {
    questionId: string;
    questions: Question[];
  };
}

interface OptionItemProps {
  option: QuestionOption;
  idx: number;
  isSelected: boolean;
  isMultiSelect: boolean;
}

function OptionItem({ option, idx, isSelected, isMultiSelect }: OptionItemProps) {
  const containerRef = useRef(null);
  const { isFocused } = useFocus({ active: true, id: FOCUS_ID.OPTION(idx) });

  const getIcon = () => {
    if (isMultiSelect) {
      return isSelected ? '◉ ' : '○ ';
    }
    return isSelected ? '✓ ' : '  ';
  };

  return (
    <Box ref={containerRef} flexWrap="nowrap">
      <Box flexShrink={0} flexWrap="nowrap">
        <Box>
          <Text color={isFocused ? theme.tokens.cyan : undefined}>{isFocused ? '❯ ' : '  '}</Text>
        </Box>
        <Box>
          <Text color={isSelected ? theme.tokens.green : undefined}>{getIcon()}</Text>
        </Box>
      </Box>
      <Text>
        <Text bold={isFocused} color={isFocused ? theme.tokens.cyan : isSelected ? theme.tokens.green : undefined}>
          {option.label}
        </Text>
        {option.description && <Text dimColor>{` — ${option.description}`}</Text>}
      </Text>
    </Box>
  );
}

interface OtherOptionProps {
  isSelected: boolean;
  isMultiSelect: boolean;
  customInput: string;
  setCustomInput: (value: string | ((prev: string) => string)) => void;
  handleOtherInputSubmit: (value: string) => void;
  cycleNext: () => void;
  cycleBack: () => void;
}

function OtherOption({
  isSelected,
  isMultiSelect,
  customInput,
  setCustomInput,
  handleOtherInputSubmit,
  cycleNext,
  cycleBack,
}: OtherOptionProps) {
  const { isFocused } = useFocus({ active: true, id: FOCUS_ID.OTHER });

  const getIcon = () => {
    if (isMultiSelect) {
      return isSelected ? '◉ ' : '○ ';
    }
    return isSelected ? '✓ ' : '  ';
  };

  return (
    <Box>
      <Box flexShrink={0}>
        <Text color={isFocused ? theme.tokens.cyan : undefined}>{isFocused ? '❯ ' : '  '}</Text>
        <Text color={isSelected ? theme.tokens.green : undefined}>{getIcon()}</Text>
        <Text bold={isFocused} color={isFocused ? theme.tokens.cyan : isSelected ? theme.tokens.green : undefined}>
          Other
        </Text>
        <Text dimColor> — </Text>
      </Box>
      <Box flexGrow={1}>
        <TextInput
          focus={isFocused}
          value={customInput}
          onChange={setCustomInput}
          placeholder="Type custom answer..."
          onSubmit={handleOtherInputSubmit}
          onUpArrow={cycleBack}
          onDownArrow={cycleNext}
        />
      </Box>
    </Box>
  );
}

function UserQuestionPromptContent({ questionData }: Props) {
  const { handleQuestionResponse } = useUserQuestion();
  const { cycleNext, cycleBack, focusedId, setFocusedId } = useFocusCycle();
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedOptionsMap, setSelectedOptionsMap] = useState<Record<string, Set<number>>>({});
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [customInputMap, setCustomInputMap] = useState<Record<string, string>>({});

  const currentQuestion = questionData.questions[currentQuestionIndex];
  const questionId = currentQuestion.id;
  const optionsWithOther = useMemo(
    () => [...currentQuestion.options, { label: 'Other', description: '' }],
    [currentQuestion.options],
  );
  const otherIndex = optionsWithOther.length - 1;
  const hasMultipleQuestions = questionData.questions.length > 1;

  const selectedOptions = selectedOptionsMap[questionId] || new Set<number>();
  const customInput = customInputMap[questionId] || '';
  const isOtherFocused = focusedId === FOCUS_ID.OTHER;
  const isSubmitFocused = focusedId === FOCUS_ID.SUBMIT;
  const focusedOptionIndex = parseFocusedIndex(focusedId);

  const isQuestionAnswered = useCallback(
    (qId: string) => {
      const answer = answers[qId];
      if (Array.isArray(answer)) {
        return answer.length > 0;
      }
      return answer && answer.length > 0;
    },
    [answers],
  );

  const allQuestionsAnswered = useMemo(() => {
    return questionData.questions.every((q) => isQuestionAnswered(q.id));
  }, [questionData.questions, isQuestionAnswered]);

  const findNextUnansweredQuestion = useCallback(() => {
    for (let i = currentQuestionIndex + 1; i < questionData.questions.length; i++) {
      if (!isQuestionAnswered(questionData.questions[i].id)) {
        return i;
      }
    }
    for (let i = 0; i < currentQuestionIndex; i++) {
      if (!isQuestionAnswered(questionData.questions[i].id)) {
        return i;
      }
    }
    return null;
  }, [currentQuestionIndex, questionData.questions, isQuestionAnswered]);

  // biome-ignore lint/correctness/useExhaustiveDependencies:  The dependencies are managed manually to avoid unnecessary resets.
  useEffect(() => {
    setFocusedId(FOCUS_ID.OPTION(0));
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: The dependencies are managed manually to avoid unnecessary resets.
  useEffect(() => {
    const existingAnswer = answers[questionId];
    if (existingAnswer && !selectedOptionsMap[questionId]) {
      if (currentQuestion.multiSelect && Array.isArray(existingAnswer)) {
        const indices = new Set<number>();
        for (const ans of existingAnswer) {
          const idx = optionsWithOther.findIndex((opt) => opt.label === ans);
          if (idx >= 0) {
            indices.add(idx);
          } else {
            indices.add(otherIndex);
            setCustomInputMap((prev) => ({ ...prev, [questionId]: ans }));
          }
        }
        setSelectedOptionsMap((prev) => ({ ...prev, [questionId]: indices }));
      } else if (typeof existingAnswer === 'string') {
        const idx = optionsWithOther.findIndex((opt) => opt.label === existingAnswer);
        if (idx < 0) {
          setCustomInputMap((prev) => ({ ...prev, [questionId]: existingAnswer }));
        }
      }
    }
  }, [questionId]);

  const saveCurrentAnswer = useCallback(() => {
    if (currentQuestion.multiSelect) {
      if (selectedOptions.size > 0) {
        const selectedLabels = Array.from(selectedOptions).map((idx) => {
          if (idx === otherIndex && customInput.trim()) {
            return customInput.trim();
          }
          return optionsWithOther[idx].label;
        });
        setAnswers((prev) => ({ ...prev, [questionId]: selectedLabels }));
      }
    }
  }, [currentQuestion.multiSelect, selectedOptions, customInput, optionsWithOther, otherIndex, questionId]);

  const goToNextQuestion = useCallback(() => {
    saveCurrentAnswer();
    if (currentQuestionIndex < questionData.questions.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      setFocusedId(FOCUS_ID.OPTION(0));
    }
  }, [currentQuestionIndex, questionData.questions.length, saveCurrentAnswer, setFocusedId]);

  const goToPrevQuestion = useCallback(() => {
    saveCurrentAnswer();
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
      setFocusedId(FOCUS_ID.OPTION(0));
    }
  }, [currentQuestionIndex, saveCurrentAnswer, setFocusedId]);

  const setCustomInput = useCallback(
    (value: string | ((prev: string) => string)) => {
      const newValue = typeof value === 'function' ? value(customInputMap[questionId] || '') : value;
      setCustomInputMap((prev) => ({
        ...prev,
        [questionId]: newValue,
      }));
      if (newValue.trim()) {
        if (currentQuestion.multiSelect) {
          setSelectedOptionsMap((prev) => {
            const next = new Set(prev[questionId] || new Set<number>());
            next.add(otherIndex);
            return { ...prev, [questionId]: next };
          });
        } else {
          setAnswers((prev) => ({ ...prev, [questionId]: newValue.trim() }));
        }
      }
    },
    [questionId, currentQuestion.multiSelect, otherIndex, customInputMap],
  );

  const setSelectedOptions = useCallback(
    (value: Set<number> | ((prev: Set<number>) => Set<number>)) => {
      setSelectedOptionsMap((prev) => ({
        ...prev,
        [questionId]: typeof value === 'function' ? value(prev[questionId] || new Set()) : value,
      }));
    },
    [questionId],
  );

  const handleOtherInputSubmit = useCallback(
    (value: string) => {
      if (currentQuestion.multiSelect) {
        if (value.trim()) {
          setSelectedOptions((prev) => {
            const next = new Set(prev);
            next.add(otherIndex);
            return next;
          });
        }

        const currentAnswerLabels = Array.from(selectedOptions).map((idx) => {
          if (idx === otherIndex && value.trim()) {
            return value.trim();
          }
          return optionsWithOther[idx].label;
        });
        if (value.trim() && !selectedOptions.has(otherIndex)) {
          currentAnswerLabels.push(value.trim());
        }

        const newAnswers = { ...answers, [questionId]: currentAnswerLabels };

        const willAllBeAnswered = questionData.questions.every((q) => {
          if (q.id === questionId) return currentAnswerLabels.length > 0;
          const answer = newAnswers[q.id];
          if (Array.isArray(answer)) return answer.length > 0;
          return answer && answer.length > 0;
        });

        if (willAllBeAnswered && currentAnswerLabels.length > 0) {
          setAnswers(newAnswers);
          setFocusedId(FOCUS_ID.SUBMIT);
        } else {
          if (currentAnswerLabels.length > 0) {
            setAnswers(newAnswers);
          }
          const nextUnanswered = findNextUnansweredQuestion();
          if (nextUnanswered !== null) {
            setCurrentQuestionIndex(nextUnanswered);
            setFocusedId(FOCUS_ID.OPTION(0));
          }
        }
      } else {
        if (!value.trim()) return;
        const newAnswers = { ...answers, [questionId]: value.trim() };
        setAnswers(newAnswers);

        const willAllBeAnswered = questionData.questions.every((q) => {
          if (q.id === questionId) return true;
          const answer = newAnswers[q.id];
          if (Array.isArray(answer)) return answer.length > 0;
          return answer && answer.length > 0;
        });

        if (willAllBeAnswered) {
          setFocusedId(FOCUS_ID.SUBMIT);
        } else {
          const nextUnanswered = findNextUnansweredQuestion();
          if (nextUnanswered !== null) {
            setCurrentQuestionIndex(nextUnanswered);
            setFocusedId(FOCUS_ID.OPTION(0));
          }
        }
      }
    },
    [
      currentQuestion.multiSelect,
      questionId,
      otherIndex,
      setSelectedOptions,
      selectedOptions,
      optionsWithOther,
      answers,
      questionData.questions,
      findNextUnansweredQuestion,
      setFocusedId,
    ],
  );

  const handleToggle = useCallback(() => {
    if (focusedOptionIndex === null && !isOtherFocused) return;

    const targetIndex = isOtherFocused ? otherIndex : (focusedOptionIndex as number);

    if (targetIndex === otherIndex) {
      if (customInput.trim()) {
        setSelectedOptions((prev) => {
          const next = new Set(prev);
          if (next.has(targetIndex)) {
            next.delete(targetIndex);
          } else {
            next.add(targetIndex);
          }
          return next;
        });
      }
    } else {
      setSelectedOptions((prev) => {
        const next = new Set(prev);
        if (next.has(targetIndex)) {
          next.delete(targetIndex);
        } else {
          next.add(targetIndex);
        }
        return next;
      });
    }
  }, [focusedOptionIndex, isOtherFocused, otherIndex, setSelectedOptions, customInput]);

  const handleSelectAndNext = useCallback(() => {
    if (focusedOptionIndex === null) return;

    const selectedLabel = optionsWithOther[focusedOptionIndex].label;
    const newAnswers = { ...answers, [questionId]: selectedLabel };
    setAnswers(newAnswers);

    const willAllBeAnswered = questionData.questions.every((q) => {
      if (q.id === questionId) return true;
      const answer = newAnswers[q.id];
      if (Array.isArray(answer)) return answer.length > 0;
      return answer && answer.length > 0;
    });

    if (willAllBeAnswered) {
      setFocusedId(FOCUS_ID.SUBMIT);
    } else {
      const nextUnanswered = findNextUnansweredQuestion();
      if (nextUnanswered !== null) {
        setCurrentQuestionIndex(nextUnanswered);
        setFocusedId(FOCUS_ID.OPTION(0));
      }
    }
  }, [
    focusedOptionIndex,
    optionsWithOther,
    questionId,
    answers,
    questionData.questions,
    findNextUnansweredQuestion,
    setFocusedId,
  ]);

  const handleMultiSelectNext = useCallback(() => {
    saveCurrentAnswer();

    const currentAnswerLabels = Array.from(selectedOptions).map((idx) => {
      if (idx === otherIndex && customInput.trim()) {
        return customInput.trim();
      }
      return optionsWithOther[idx].label;
    });

    const newAnswers = { ...answers, [questionId]: currentAnswerLabels };

    const willAllBeAnswered = questionData.questions.every((q) => {
      if (q.id === questionId) return currentAnswerLabels.length > 0;
      const answer = newAnswers[q.id];
      if (Array.isArray(answer)) return answer.length > 0;
      return answer && answer.length > 0;
    });

    if (willAllBeAnswered && currentAnswerLabels.length > 0) {
      setAnswers(newAnswers);
      setFocusedId(FOCUS_ID.SUBMIT);
    } else {
      const nextUnanswered = findNextUnansweredQuestion();
      if (nextUnanswered !== null) {
        setCurrentQuestionIndex(nextUnanswered);
        setFocusedId(FOCUS_ID.OPTION(0));
      }
    }
  }, [
    saveCurrentAnswer,
    selectedOptions,
    otherIndex,
    customInput,
    optionsWithOther,
    answers,
    questionId,
    questionData.questions,
    findNextUnansweredQuestion,
    setFocusedId,
  ]);

  const submitAllAnswers = useCallback(() => {
    if (allQuestionsAnswered) {
      saveCurrentAnswer();
      handleQuestionResponse(answers);
    }
  }, [allQuestionsAnswered, answers, handleQuestionResponse, saveCurrentAnswer]);

  useInput(
    (input, key) => {
      if (key.upArrow) {
        cycleBack();
        return;
      }

      if (key.downArrow) {
        cycleNext();
        return;
      }

      if (key.leftArrow && hasMultipleQuestions) {
        goToPrevQuestion();
        return;
      }

      if (key.rightArrow && hasMultipleQuestions && currentQuestionIndex < questionData.questions.length - 1) {
        goToNextQuestion();
        return;
      }

      if (key.return && !isOtherFocused && !isSubmitFocused) {
        if (currentQuestion.multiSelect) {
          handleMultiSelectNext();
        } else if (focusedOptionIndex !== null) {
          handleSelectAndNext();
        }
        return;
      }

      if (input === ' ' && currentQuestion.multiSelect && !isOtherFocused && !isSubmitFocused) {
        handleToggle();
        return;
      }
    },
    { isActive: !isOtherFocused },
  );

  const title = <Text>{currentQuestion.header}</Text>;

  const rightTitle = (
    <Text>
      {currentQuestionIndex + 1}/{questionData.questions.length}
    </Text>
  );

  const footerSegments = currentQuestion.multiSelect
    ? [
        { text: '↑↓/←→/Tab', highlight: true },
        { text: ' navigate • ' },
        { text: 'Enter', highlight: true },
        { text: ' submit • ' },
        { text: 'Space', highlight: true },
        { text: ' toggle' },
      ]
    : [
        { text: '↑↓/←→/Tab', highlight: true },
        { text: ' navigate • ' },
        { text: 'Enter', highlight: true },
        { text: ' submit' },
      ];

  const footer = (
    <Box marginLeft={1} flexGrow={1} marginRight={1}>
      <HelpText segments={footerSegments} />
    </Box>
  );

  return (
    <AppModal
      visible
      title={title}
      rightTitle={rightTitle}
      footer={footer}
      paddingX={0}
      paddingY={0}
      marginX={0}
      marginY={0}
    >
      <Box flexDirection="column" width="100%" paddingX={1}>
        <Box marginBottom={1}>
          <TextWrapper>{currentQuestion.question}</TextWrapper>
        </Box>
        {optionsWithOther.map((option, idx) => {
          const isSelected = currentQuestion.multiSelect
            ? selectedOptions.has(idx)
            : answers[questionId] === option.label ||
              (idx === otherIndex && !!customInput.trim() && answers[questionId] === customInput.trim());
          const isOther = idx === otherIndex;

          if (isOther) {
            return (
              <OtherOption
                key={`${option.label}-${idx}`}
                isSelected={isSelected}
                isMultiSelect={currentQuestion.multiSelect}
                customInput={customInput}
                setCustomInput={setCustomInput}
                handleOtherInputSubmit={handleOtherInputSubmit}
                cycleNext={cycleNext}
                cycleBack={cycleBack}
              />
            );
          }

          return (
            <OptionItem
              key={`${option.label}-${idx}`}
              option={option}
              idx={idx}
              isSelected={isSelected}
              isMultiSelect={currentQuestion.multiSelect}
            />
          );
        })}
        <Box marginY={1}>
          <Button
            label="Submit"
            onSubmit={submitAllAnswers}
            disabled={!allQuestionsAnswered}
            focusId={FOCUS_ID.SUBMIT}
          />
        </Box>
      </Box>
    </AppModal>
  );
}

export function UserQuestionPrompt({ questionData }: Props) {
  return (
    <FocusProvider>
      <UserQuestionPromptContent questionData={questionData} />
    </FocusProvider>
  );
}
