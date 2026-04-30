import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { IOrchestratorManager } from '@/services/IOrchestratorManager';
import type { AgentEvent } from '@nuvin/nuvin-core';
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
  orchestratorManager: IOrchestratorManager | null;
  children: ReactNode;
}) {
  const [pendingQuestion, setPendingQuestion] = useState<QuestionData | null>(null);
  const submittedRef = useRef<Set<string>>(new Set());

  const handleQuestionResponse = useCallback(
    (answers: Record<string, string | string[]>) => {
      if (!pendingQuestion || !orchestratorManager) {
        return;
      }

      if (submittedRef.current.has(pendingQuestion.questionId)) {
        return;
      }

      submittedRef.current.add(pendingQuestion.questionId);
      orchestratorManager.handleUserQuestionResponse(pendingQuestion.questionId, answers);
      setPendingQuestion(null);
    },
    [pendingQuestion, orchestratorManager],
  );

  useEffect(() => {
    const handleEvent = (event: AgentEvent) => {
      if (event?.type === 'user_question_required') {
        const data = event as AgentEvent & { questionId: string; questions: QuestionData['questions'] };
        setPendingQuestion({
          questionId: data.questionId,
          questions: data.questions,
        });
      }
    };

    eventBus.on('agent:event', handleEvent);
    return () => {
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
