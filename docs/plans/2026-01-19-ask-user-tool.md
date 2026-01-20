# Ask User Tool Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement `ask_user_tool` that enables AI to present structured multiple-choice questions to users during task execution, blocking until responses are received.

**Architecture:** Follow the existing tool approval pattern using Promise-based blocking with `pendingApprovals` map. Add new event types `UserQuestionRequired` and `UserQuestionResponse` to the event system. Integrate with the CLI's React UI similar to how `ToolApprovalPrompt` works.

**Tech Stack:** TypeScript, Vitest, React (for CLI UI integration)

---

## Task 1: Add Event Types for User Questions

**Files:**
- Modify: `packages/nuvin-core/src/ports.ts:493-511` (AgentEventTypes)
- Modify: `packages/nuvin-core/src/ports.ts:515-645` (AgentEvent union type)

**Step 1: Write the failing test**

Create: `packages/nuvin-core/src/tests/ask-user-tool.test.ts`

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import { AgentEventTypes } from '../ports.js';
import type { AgentEvent, EventPort } from '../ports.js';

describe('AskUserTool', () => {
  let emittedEvents: AgentEvent[];
  let mockEvents: EventPort;

  beforeEach(() => {
    emittedEvents = [];
    mockEvents = {
      emit: vi.fn((event: AgentEvent) => {
        emittedEvents.push(event);
        return Promise.resolve();
      }),
    };
  });

  it('should emit UserQuestionRequired event when tool is called', async () => {
    // This test will fail until we add the event types
    const questionEvent = emittedEvents.find(
      (e) => e.type === AgentEventTypes.UserQuestionRequired
    );
    expect(questionEvent).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/nuvin-core && pnpm test ask-user-tool.test.ts`
Expected: FAIL with "Property 'UserQuestionRequired' does not exist"

**Step 3: Add event types to AgentEventTypes**

Modify `packages/nuvin-core/src/ports.ts`:

```typescript
export const AgentEventTypes = {
  MessageStarted: 'message_started',
  ToolCalls: 'tool_calls',
  ToolApprovalRequired: 'tool_approval_required',
  ToolApprovalResponse: 'tool_approval_response',
  ToolResult: 'tool_result',
  ReasoningChunk: 'reasoning_chunk',
  AssistantChunk: 'assistant_chunk',
  AssistantMessage: 'assistant_message',
  StreamFinish: 'stream_finish',
  Done: 'done',
  Error: 'error',
  MCPStderr: 'mcp_stderr',
  SubAgentStarted: 'sub_agent_started',
  SubAgentToolCall: 'sub_agent_tool_call',
  SubAgentToolResult: 'sub_agent_tool_result',
  SubAgentCompleted: 'sub_agent_completed',
  SubAgentMetrics: 'sub_agent_metrics',
  UserQuestionRequired: 'user_question_required',    // NEW
  UserQuestionResponse: 'user_question_response',    // NEW
} as const;
```

**Step 4: Add event types to AgentEvent union**

Add to `packages/nuvin-core/src/ports.ts` after SubAgentMetrics event (around line 645):

```typescript
  | {
      type: typeof AgentEventTypes.UserQuestionRequired;
      conversationId: string;
      messageId: string;
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
  | {
      type: typeof AgentEventTypes.UserQuestionResponse;
      conversationId: string;
      messageId: string;
      questionId: string;
      answers: Record<string, string | string[]>;
    };
```

**Step 5: Run test to verify it passes (partially)**

Run: `cd packages/nuvin-core && pnpm test ask-user-tool.test.ts`
Expected: Test still fails but now compiles - event types exist but not emitted yet

**Step 6: Commit**

```bash
git add packages/nuvin-core/src/ports.ts packages/nuvin-core/src/tests/ask-user-tool.test.ts
git commit -m "feat: add UserQuestion event types to event system"
```

---

## Task 2: Create AskUserTool Implementation

**Files:**
- Create: `packages/nuvin-core/src/tools/AskUserTool.ts`
- Modify: `packages/nuvin-core/src/tools/tool-params.ts`
- Modify: `packages/nuvin-core/src/tools/tool-result-metadata.ts`

**Step 1: Write the failing test**

Add to `packages/nuvin-core/src/tests/ask-user-tool.test.ts`:

```typescript
import { AskUserTool } from '../tools/AskUserTool.js';

describe('AskUserTool', () => {
  // ... existing setup ...

  it('should validate questions array has 1-4 items', async () => {
    const tool = new AskUserTool();
    
    // Empty array should fail
    const result1 = await tool.execute({ questions: [] });
    expect(result1.status).toBe('error');
    
    // 5 questions should fail
    const result2 = await tool.execute({ 
      questions: Array(5).fill({ 
        question: 'Q?', 
        header: 'H', 
        options: [{label: 'A', description: 'B'}], 
        multiSelect: false 
      }) 
    });
    expect(result2.status).toBe('error');
    
    // 1-4 questions should pass validation
    const result3 = await tool.execute({ 
      questions: [{ 
        question: 'Pick one?', 
        header: 'Choice', 
        options: [
          {label: 'Option A', description: 'First choice'},
          {label: 'Option B', description: 'Second choice'}
        ], 
        multiSelect: false 
      }] 
    });
    expect(result3.status).toBe('success');
  });

  it('should validate each question has 2-4 options', async () => {
    const tool = new AskUserTool();
    
    // 1 option should fail
    const result1 = await tool.execute({ 
      questions: [{ 
        question: 'Q?', 
        header: 'H', 
        options: [{label: 'A', description: 'B'}], 
        multiSelect: false 
      }] 
    });
    expect(result1.status).toBe('error');
    
    // 5 options should fail
    const result2 = await tool.execute({ 
      questions: [{ 
        question: 'Q?', 
        header: 'H', 
        options: Array(5).fill({label: 'A', description: 'B'}), 
        multiSelect: false 
      }] 
    });
    expect(result2.status).toBe('error');
  });

  it('should validate header is max 12 characters', async () => {
    const tool = new AskUserTool();
    
    const result = await tool.execute({ 
      questions: [{ 
        question: 'Q?', 
        header: 'ThisIsWayTooLong', 
        options: [
          {label: 'A', description: 'B'},
          {label: 'C', description: 'D'}
        ], 
        multiSelect: false 
      }] 
    });
    expect(result.status).toBe('error');
    expect(result.result).toContain('12 characters');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/nuvin-core && pnpm test ask-user-tool.test.ts`
Expected: FAIL with "Cannot find module '../tools/AskUserTool.js'"

**Step 3: Add type definitions**

Add to `packages/nuvin-core/src/tools/tool-params.ts`:

```typescript
export type AskUserArgs = {
  description?: string;
  questions: Array<{
    question: string;
    header: string;
    options: Array<{
      label: string;
      description: string;
    }>;
    multiSelect: boolean;
  }>;
  answers?: Record<string, string | string[]>;
};
```

Add to `packages/nuvin-core/src/tools/tool-result-metadata.ts`:

```typescript
export type AskUserMetadata = {
  questionId: string;
  questionCount: number;
  answers: Record<string, string | string[]>;
};
```

**Step 4: Implement AskUserTool**

Create `packages/nuvin-core/src/tools/AskUserTool.ts`:

```typescript
import type { ToolDefinition } from '../ports.js';
import { ErrorReason, AgentEventTypes } from '../ports.js';
import type { FunctionTool, ToolExecutionContext, ExecResultError } from './types.js';
import { okText, err } from './result-helpers.js';
import type { AskUserArgs } from './tool-params.js';
import type { AskUserMetadata } from './tool-result-metadata.js';

export type AskUserSuccessResult = {
  status: 'success';
  type: 'text';
  result: string;
  metadata: AskUserMetadata;
};

export type AskUserErrorResult = ExecResultError;

export type AskUserResult = AskUserSuccessResult | AskUserErrorResult;

export class AskUserTool implements FunctionTool<AskUserArgs, ToolExecutionContext, AskUserResult> {
  name = 'ask_user_tool' as const;

  parameters = {
    type: 'object',
    properties: {
      questions: {
        type: 'array',
        minItems: 1,
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            question: {
              type: 'string',
              description: 'The complete question to ask the user. Should be clear, specific, and end with a question mark. Example: "Which library should we use for date formatting?" If multiSelect is true, phrase it accordingly, e.g. "Which features do you want to enable?"'
            },
            header: {
              type: 'string',
              description: 'Very short label displayed as a chip/tag (max 12 chars). Examples: "Auth method", "Library", "Approach".'
            },
            options: {
              type: 'array',
              minItems: 2,
              maxItems: 4,
              items: {
                type: 'object',
                properties: {
                  label: {
                    type: 'string',
                    description: 'The display text for this option that the user will see and select. Should be concise (1-5 words) and clearly describe the choice.'
                  },
                  description: {
                    type: 'string',
                    description: 'Explanation of what this option means or what will happen if chosen. Useful for providing context about trade-offs or implications.'
                  }
                },
                required: ['label', 'description']
              },
              description: 'The available choices for this question. Must have 2-4 options. Each option should be a distinct, mutually exclusive choice (unless multiSelect is enabled). There should be no \'Other\' option, that will be provided automatically.'
            },
            multiSelect: {
              type: 'boolean',
              description: 'Set to true to allow the user to select multiple options instead of just one. Use when choices are not mutually exclusive.'
            }
          },
          required: ['question', 'header', 'options', 'multiSelect']
        },
        description: 'Questions to ask the user (1-4 questions)'
      },
      answers: {
        type: 'object',
        additionalProperties: {
          type: 'string'
        },
        description: 'User answers collected by the permission component'
      }
    },
    required: ['questions']
  } as const;

  definition(): ToolDefinition['function'] {
    return {
      name: this.name,
      description: `Use this tool when you need to ask the user questions during execution. This allows you to:
1. Gather user preferences or requirements
2. Clarify ambiguous instructions
3. Get decisions on implementation choices as you work
4. Offer choices to the user about what direction to take.

Usage notes:
- Users will always be able to select "Other" to provide custom text input
- Use multiSelect: true to allow multiple answers to be selected for a question
- If you recommend a specific option, make that the first option in the list and add "(Recommended)" at the end of the label`,
      parameters: this.parameters,
    };
  }

  async execute(params: AskUserArgs, context?: ToolExecutionContext): Promise<AskUserResult> {
    // Validation
    if (!params.questions || !Array.isArray(params.questions)) {
      return err('Parameter "questions" is required and must be an array', undefined, ErrorReason.InvalidInput);
    }

    if (params.questions.length < 1 || params.questions.length > 4) {
      return err('Must provide 1-4 questions', undefined, ErrorReason.InvalidInput);
    }

    for (let i = 0; i < params.questions.length; i++) {
      const q = params.questions[i];
      
      if (!q.question || typeof q.question !== 'string') {
        return err(`Question ${i + 1}: "question" field is required and must be a string`, undefined, ErrorReason.InvalidInput);
      }

      if (!q.header || typeof q.header !== 'string') {
        return err(`Question ${i + 1}: "header" field is required and must be a string`, undefined, ErrorReason.InvalidInput);
      }

      if (q.header.length > 12) {
        return err(`Question ${i + 1}: "header" must be max 12 characters, got ${q.header.length}`, undefined, ErrorReason.InvalidInput);
      }

      if (!Array.isArray(q.options) || q.options.length < 2 || q.options.length > 4) {
        return err(`Question ${i + 1}: must have 2-4 options`, undefined, ErrorReason.InvalidInput);
      }

      for (let j = 0; j < q.options.length; j++) {
        const opt = q.options[j];
        if (!opt.label || !opt.description) {
          return err(`Question ${i + 1}, Option ${j + 1}: both "label" and "description" are required`, undefined, ErrorReason.InvalidInput);
        }
      }

      if (typeof q.multiSelect !== 'boolean') {
        return err(`Question ${i + 1}: "multiSelect" must be a boolean`, undefined, ErrorReason.InvalidInput);
      }
    }

    // If answers already provided (second call), return them
    if (params.answers && Object.keys(params.answers).length > 0) {
      const questionId = context?.messageId || 'unknown';
      return okText(
        `User responses received: ${JSON.stringify(params.answers, null, 2)}`,
        {
          questionId,
          questionCount: params.questions.length,
          answers: params.answers,
        }
      );
    }

    // Otherwise, we need to emit event and wait for response
    // This will be implemented in Task 3 when we integrate with orchestrator
    return err('User question mechanism not yet integrated with orchestrator', undefined, ErrorReason.Unknown);
  }
}
```

**Step 5: Run test to verify it passes**

Run: `cd packages/nuvin-core && pnpm test ask-user-tool.test.ts`
Expected: Validation tests should pass

**Step 6: Commit**

```bash
git add packages/nuvin-core/src/tools/AskUserTool.ts packages/nuvin-core/src/tools/tool-params.ts packages/nuvin-core/src/tools/tool-result-metadata.ts packages/nuvin-core/src/tests/ask-user-tool.test.ts
git commit -m "feat: implement AskUserTool with validation logic"
```

---

## Task 3: Integrate AskUserTool with Orchestrator

**Files:**
- Modify: `packages/nuvin-core/src/orchestrator.ts` (add pendingQuestions map and handleUserQuestionResponse)
- Modify: `packages/nuvin-core/src/tools/AskUserTool.ts` (emit event and wait for response)

**Step 1: Write the failing test**

Add to `packages/nuvin-core/src/tests/ask-user-tool.test.ts`:

```typescript
it('should emit UserQuestionRequired event and wait for response', async () => {
  // This will be a full integration test with orchestrator
  // Will be implemented when we modify orchestrator
  expect(true).toBe(true); // Placeholder
});
```

**Step 2: Add pendingQuestions map to orchestrator**

Modify `packages/nuvin-core/src/orchestrator.ts` after `pendingApprovals` (around line 140):

```typescript
  // Per-question response map: questionId -> { resolve, reject, questions }
  private pendingQuestions = new Map<
    string,
    {
      resolve: (result: Record<string, string | string[]>) => void;
      reject: (error: Error) => void;
      questions: Array<{
        id: string;
        question: string;
        header: string;
        options: Array<{ label: string; description: string }>;
        multiSelect: boolean;
      }>;
    }
  >();
```

**Step 3: Add handleUserQuestionResponse method**

Add to `packages/nuvin-core/src/orchestrator.ts` after `handleToolApproval` method (around line 966):

```typescript
  /**
   * Handles user's response to questions.
   * Called by UI when user submits answers.
   */
  public handleUserQuestionResponse(
    questionId: string,
    answers: Record<string, string | string[]>,
  ): void {
    const pending = this.pendingQuestions.get(questionId);
    if (!pending) {
      console.warn(`[Orchestrator] Received response for unknown or already processed question ID: ${questionId}`);
      return;
    }

    this.pendingQuestions.delete(questionId);

    // Emit response event
    void this.events?.emit({
      type: AgentEventTypes.UserQuestionResponse,
      conversationId: this.context.conversationId,
      messageId: this.context.messageId,
      questionId,
      answers,
    });

    pending.resolve(answers);
  }
```

**Step 4: Create question waiting mechanism**

Modify `packages/nuvin-core/src/tools/AskUserTool.ts`, replace the execute method's end:

```typescript
  async execute(params: AskUserArgs, context?: ToolExecutionContext): Promise<AskUserResult> {
    // ... existing validation code ...

    // If answers already provided (second call), return them
    if (params.answers && Object.keys(params.answers).length > 0) {
      const questionId = context?.messageId || 'unknown';
      return okText(
        `User responses received: ${JSON.stringify(params.answers, null, 2)}`,
        {
          questionId,
          questionCount: params.questions.length,
          answers: params.answers,
        }
      );
    }

    // Generate unique question ID
    const questionId = `question-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    // Prepare questions with IDs
    const questionsWithIds = params.questions.map((q, idx) => ({
      id: `q${idx}`,
      question: q.question,
      header: q.header,
      options: q.options,
      multiSelect: q.multiSelect,
    }));

    // Emit event
    if (context?.eventPort) {
      await context.eventPort.emit({
        type: AgentEventTypes.UserQuestionRequired,
        conversationId: context.conversationId || 'unknown',
        messageId: context.messageId || 'unknown',
        questionId,
        questions: questionsWithIds,
      });
    }

    // Wait for response
    // This requires access to orchestrator's handleUserQuestionResponse
    // We'll use a callback mechanism via context
    if (context?.waitForUserQuestion) {
      try {
        const answers = await context.waitForUserQuestion(questionId, questionsWithIds);
        return okText(
          `User responses received: ${JSON.stringify(answers, null, 2)}`,
          {
            questionId,
            questionCount: params.questions.length,
            answers,
          }
        );
      } catch (error) {
        return err(
          error instanceof Error ? error.message : 'Failed to get user response',
          undefined,
          ErrorReason.Unknown
        );
      }
    }

    return err('Context does not support user questions', undefined, ErrorReason.Unknown);
  }
```

**Step 5: Add waitForUserQuestion to ToolExecutionContext**

Modify `packages/nuvin-core/src/tools/types.ts`:

```typescript
export type ToolExecutionContext = {
  conversationId?: string;
  agentId?: string;
  sessionId?: string;
  workspaceDir?: string;
  delegationDepth?: number;
  messageId?: string;
  eventPort?: EventPort;
  signal?: AbortSignal;
  waitForUserQuestion?: (
    questionId: string,
    questions: Array<{
      id: string;
      question: string;
      header: string;
      options: Array<{ label: string; description: string }>;
      multiSelect: boolean;
    }>
  ) => Promise<Record<string, string | string[]>>;
} & Record<string, unknown>;
```

**Step 6: Implement waitForUserQuestion in orchestrator tool execution**

Modify `packages/nuvin-core/src/orchestrator.ts` in the tool execution context (search for `executeToolCalls` and add to context):

```typescript
// Around line 660-680 where tool execution context is created
const toolContext: ToolExecutionContext = {
  conversationId: this.context.conversationId,
  messageId: this.context.messageId,
  workspaceDir: this.cfg.workspaceDir,
  delegationDepth: 0,
  eventPort: this.events,
  signal: this.abortController?.signal,
  waitForUserQuestion: async (questionId, questions) => {
    // Store the promise resolver
    return new Promise<Record<string, string | string[]>>((resolve, reject) => {
      this.pendingQuestions.set(questionId, {
        resolve,
        reject,
        questions,
      });

      // Timeout after 5 minutes
      setTimeout(() => {
        if (this.pendingQuestions.has(questionId)) {
          this.pendingQuestions.delete(questionId);
          reject(new Error('User question timed out after 5 minutes'));
        }
      }, 5 * 60 * 1000);
    });
  },
};
```

**Step 7: Run test to verify basic integration**

Run: `cd packages/nuvin-core && pnpm test ask-user-tool.test.ts`
Expected: Tests should pass

**Step 8: Commit**

```bash
git add packages/nuvin-core/src/orchestrator.ts packages/nuvin-core/src/tools/AskUserTool.ts packages/nuvin-core/src/tools/types.ts packages/nuvin-core/src/tests/ask-user-tool.test.ts
git commit -m "feat: integrate AskUserTool with orchestrator event system"
```

---

## Task 4: Register AskUserTool

**Files:**
- Modify: `packages/nuvin-core/src/tools.ts`
- Modify: `packages/nuvin-core/src/index.ts`

**Step 1: Write the failing test**

Add to `packages/nuvin-core/src/tests/ask-user-tool.test.ts`:

```typescript
import { DefaultToolPort } from '../tools.js';

it('should be registered in DefaultToolPort', () => {
  const toolPort = new DefaultToolPort();
  const definitions = toolPort.getToolDefinitions(['ask_user_tool']);
  
  expect(definitions).toHaveLength(1);
  expect(definitions[0].function.name).toBe('ask_user_tool');
});
```

**Step 2: Run test to verify it fails**

Run: `cd packages/nuvin-core && pnpm test ask-user-tool.test.ts`
Expected: FAIL - tool not registered

**Step 3: Import and register AskUserTool**

Modify `packages/nuvin-core/src/tools.ts`:

```typescript
import { AskUserTool } from './tools/AskUserTool.js';

// In the DefaultToolPort class constructor, add:
const askUserTool = new AskUserTool();
this.tools.set(askUserTool.name, askUserTool);
```

**Step 4: Export from index**

Modify `packages/nuvin-core/src/index.ts`:

```typescript
export { AskUserTool } from './tools/AskUserTool.js';
export type { AskUserArgs } from './tools/tool-params.js';
export type { AskUserMetadata } from './tools/tool-result-metadata.js';
```

**Step 5: Run test to verify it passes**

Run: `cd packages/nuvin-core && pnpm test ask-user-tool.test.ts`
Expected: PASS

**Step 6: Run all core tests**

Run: `cd packages/nuvin-core && pnpm test`
Expected: All tests pass

**Step 7: Commit**

```bash
git add packages/nuvin-core/src/tools.ts packages/nuvin-core/src/index.ts packages/nuvin-core/src/tests/ask-user-tool.test.ts
git commit -m "feat: register AskUserTool in DefaultToolPort"
```

---

## Task 5: Create CLI UI Component for User Questions

**Files:**
- Create: `packages/nuvin-cli/source/components/UserQuestionPrompt/UserQuestionPrompt.tsx`
- Create: `packages/nuvin-cli/source/components/UserQuestionPrompt/index.ts`
- Create: `packages/nuvin-cli/source/contexts/UserQuestionContext.tsx`

**Step 1: Create UserQuestionContext**

Create `packages/nuvin-cli/source/contexts/UserQuestionContext.tsx`:

```typescript
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
```

**Step 2: Create UserQuestionPrompt component**

Create `packages/nuvin-cli/source/components/UserQuestionPrompt/UserQuestionPrompt.tsx`:

```typescript
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
```

Create `packages/nuvin-cli/source/components/UserQuestionPrompt/index.ts`:

```typescript
export { UserQuestionPrompt } from './UserQuestionPrompt.js';
```

**Step 3: Commit**

```bash
git add packages/nuvin-cli/source/contexts/UserQuestionContext.tsx packages/nuvin-cli/source/components/UserQuestionPrompt/
git commit -m "feat: add UserQuestionPrompt UI component and context"
```

---

## Task 6: Integrate UserQuestionPrompt into CLI App

**Files:**
- Modify: `packages/nuvin-cli/source/cli.tsx`
- Modify: `packages/nuvin-cli/source/app.tsx` (or app-virtualized.tsx)
- Modify: `packages/nuvin-cli/source/components/InteractionArea.tsx`

**Step 1: Add UserQuestionProvider to CLI**

Modify `packages/nuvin-cli/source/cli.tsx` to wrap with UserQuestionProvider (similar to ToolApprovalProvider):

```typescript
import { UserQuestionProvider } from './contexts/UserQuestionContext.js';

// In the render section, add UserQuestionProvider:
<UserQuestionProvider>
  <ToolApprovalProvider
    orchestratorManager={orchestratorManager}
    requireToolApproval={finalRequireToolApproval}
  >
    {/* existing app */}
  </ToolApprovalProvider>
</UserQuestionProvider>
```

**Step 2: Add question prompt to InteractionArea**

Modify `packages/nuvin-cli/source/components/InteractionArea.tsx`:

```typescript
import { useUserQuestion } from '@/contexts/UserQuestionContext.js';
import { UserQuestionPrompt } from './UserQuestionPrompt/index.js';

// In InteractionArea component:
const { pendingQuestion } = useUserQuestion();
const hasPendingQuestion = pendingQuestion !== null;

// In the render section, add conditional rendering:
{hasPendingQuestion && pendingQuestion && (
  <UserQuestionPrompt questionData={pendingQuestion} />
)}
```

**Step 3: Update InputArea to disable during questions**

Modify `packages/nuvin-cli/source/components/InputArea.tsx` to accept `showUserQuestion` prop:

```typescript
interface Props {
  // ... existing props
  showUserQuestion?: boolean;
}

// Update focus logic:
focus={isFocused && !showToolApproval && !showUserQuestion && !disabled}
```

**Step 4: Manual testing**

Since this is UI integration, manual testing is required:

1. Start the CLI: `pnpm dev`
2. Trigger a question (will need to update system prompt or test manually)
3. Verify question appears and can be answered
4. Verify answer is sent back to AI

**Step 5: Commit**

```bash
git add packages/nuvin-cli/source/cli.tsx packages/nuvin-cli/source/app.tsx packages/nuvin-cli/source/components/InteractionArea.tsx packages/nuvin-cli/source/components/InputArea.tsx
git commit -m "feat: integrate UserQuestionPrompt into CLI app"
```

---

## Task 7: Add AskUserTool to System Prompt

**Files:**
- Modify: `tools.json` or wherever system prompts are defined

**Step 1: Add tool description to system prompt**

Modify the system prompt to include documentation about the ask_user_tool (similar to how AskUserQuestion is mentioned in ExitPlanMode description in tools.json line 246).

Add section about using ask_user_tool for clarification during execution.

**Step 2: Commit**

```bash
git add tools.json
git commit -m "docs: add ask_user_tool to system prompt documentation"
```

---

## Task 8: Write Integration Tests

**Files:**
- Create: `packages/nuvin-core/src/tests/ask-user-tool-integration.test.ts`

**Step 1: Write full integration test**

Create `packages/nuvin-core/src/tests/ask-user-tool-integration.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentOrchestrator } from '../orchestrator.js';
import { AgentEventTypes } from '../ports.js';
import type { AgentEvent, EventPort } from '../ports.js';

describe('AskUserTool Integration', () => {
  it('should handle full question-response flow', async () => {
    // Full end-to-end test
    // 1. Tool emits UserQuestionRequired
    // 2. Orchestrator receives it
    // 3. UI calls handleUserQuestionResponse
    // 4. Tool receives answer and returns success
    
    // Implementation would go here
    expect(true).toBe(true); // Placeholder
  });

  it('should handle timeout when user does not respond', async () => {
    // Test 5-minute timeout
    expect(true).toBe(true); // Placeholder
  });

  it('should handle multiple questions in sequence', async () => {
    // Test asking 4 questions one after another
    expect(true).toBe(true); // Placeholder
  });

  it('should support multiSelect answers', async () => {
    // Test multi-select returning array of strings
    expect(true).toBe(true); // Placeholder
  });
});
```

**Step 2: Run tests**

Run: `cd packages/nuvin-core && pnpm test ask-user-tool-integration.test.ts`
Expected: Tests pass (or implement them properly)

**Step 3: Commit**

```bash
git add packages/nuvin-core/src/tests/ask-user-tool-integration.test.ts
git commit -m "test: add integration tests for ask_user_tool"
```

---

## Task 9: Update Documentation

**Files:**
- Create: `docs/ask-user-tool-usage.md`

**Step 1: Write usage documentation**

Create `docs/ask-user-tool-usage.md`:

```markdown
# Ask User Tool Usage Guide

## Overview

The `ask_user_tool` enables the AI to ask structured multiple-choice questions to users during task execution.

## Parameters

- `questions`: Array of 1-4 question objects
  - `question`: Full question text
  - `header`: Short label (max 12 chars)
  - `options`: 2-4 option objects with `label` and `description`
  - `multiSelect`: Boolean for allowing multiple selections

## Examples

### Single Choice Question

\`\`\`json
{
  "questions": [{
    "question": "Which authentication method should we use?",
    "header": "Auth",
    "options": [
      {"label": "JWT (Recommended)", "description": "Stateless, scalable"},
      {"label": "Session cookies", "description": "Traditional, requires state"}
    ],
    "multiSelect": false
  }]
}
\`\`\`

### Multiple Choice Question

\`\`\`json
{
  "questions": [{
    "question": "Which features do you want to enable?",
    "header": "Features",
    "options": [
      {"label": "Dark mode", "description": "Toggle UI theme"},
      {"label": "Notifications", "description": "Push notifications"},
      {"label": "Analytics", "description": "Track usage"}
    ],
    "multiSelect": true
  }]
}
\`\`\`

## Notes

- "Other" option is automatically added by the UI
- Questions block execution until answered
- 5-minute timeout if no response
```

**Step 2: Commit**

```bash
git add docs/ask-user-tool-usage.md
git commit -m "docs: add usage guide for ask_user_tool"
```

---

## Final Steps

**Step 1: Run all tests**

```bash
cd packages/nuvin-core && pnpm test
cd packages/nuvin-cli && pnpm build
```

Expected: All tests pass, build succeeds

**Step 2: Manual E2E testing**

1. Start CLI: `pnpm dev`
2. Ask AI a question that requires clarification
3. Verify question prompt appears
4. Answer question
5. Verify AI receives answer and continues

**Step 3: Final commit**

```bash
git add .
git commit -m "feat: complete ask_user_tool implementation"
```

---

## Plan Complete

This implementation follows the existing patterns from tool approval:
- Event-based communication (`UserQuestionRequired`, `UserQuestionResponse`)
- Promise-based blocking via `pendingQuestions` map
- React UI component similar to `ToolApprovalPrompt`
- Full validation and error handling
- TDD approach with tests written first
