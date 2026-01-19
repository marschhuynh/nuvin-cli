import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { useOrchestratorManager } from './OrchestratorManagerContext.js';

interface QuestionData {
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
}

interface UserQuestionState {
  pendingQuestion: QuestionData | null;
  handleQuestionResponse: (answers: Record<string, string | string[]>) => void;
}

const UserQuestionContext = createContext<UserQuestionState | undefined>(undefined);

export function UserQuestionProvider({ children }: { children: ReactNode }) {
  const { orchestratorManager } = useOrchestratorManager();
  const [pendingQuestion, setPendingQuestion] = useState<QuestionData | null>(null);

  const handleQuestionResponse = useCallback(
    (answers: Record<string, string | string[]>) => {
      if (pendingQuestion) {
        orchestratorManager?.getOrchestrator()?.handleUserQuestionResponse(
          pendingQuestion.questionId,
          answers
        );
        setPendingQuestion(null);
      }
    },
    [pendingQuestion, orchestratorManager]
  );

  useEffect(() => {
    if (!orchestratorManager) return;

    const handleEvent = (event: any) => {
      if (event.type === 'user_question_required') {
        setPendingQuestion({
          questionId: event.questionId,
          questions: event.questions,
        });
      }
    };

    orchestratorManager.on('event', handleEvent);
    return () => {
      orchestratorManager.off('event', handleEvent);
    };
  }, [orchestratorManager]);

  const value = {
    pendingQuestion,
    handleQuestionResponse,
  };

  return <UserQuestionContext.Provider value={value}>{children}</UserQuestionContext.Provider>;
}

export function useUserQuestion() {
  const context = useContext(UserQuestionContext);
  if (!context) {
    throw new Error('useUserQuestion must be used within UserQuestionProvider');
  }
  return context;
}

export type { UserQuestionState };
