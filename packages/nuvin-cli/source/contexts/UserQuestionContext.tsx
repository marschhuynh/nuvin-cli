import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import type { OrchestratorManager } from '@/services/OrchestratorManager';
import { eventBus } from '@/services/EventBus.js';

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

export function UserQuestionProvider({
  orchestratorManager,
  children,
}: {
  orchestratorManager: OrchestratorManager | null;
  children: ReactNode;
}) {
  const [pendingQuestion, setPendingQuestion] = useState<QuestionData | null>(null);

  const handleQuestionResponse = useCallback(
    (answers: Record<string, string | string[]>) => {
      if (pendingQuestion && orchestratorManager?.getOrchestrator()) {
        // @ts-expect-error - Method exists but not in type definition yet
        orchestratorManager.getOrchestrator()!.handleUserQuestionResponse(
          pendingQuestion.questionId,
          answers
        );
        setPendingQuestion(null);
      }
    },
    [pendingQuestion, orchestratorManager]
  );

  useEffect(() => {
    const handleEvent = (data: any) => {
      if (data?.type === 'user_question_required') {
        setPendingQuestion({
          questionId: data.questionId,
          questions: data.questions,
        });
      }
    };

    // @ts-ignore - Event type not yet added to EventMap
    eventBus.on('agent:event', handleEvent);
    return () => {
      // @ts-ignore
      eventBus.off('agent:event', handleEvent);
    };
  }, []);

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
