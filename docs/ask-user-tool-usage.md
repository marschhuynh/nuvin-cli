# Ask User Tool Usage Guide

## Overview

The `ask_user_tool` enables the AI to ask structured multiple-choice questions to users during task execution. Questions are presented in the CLI UI with interactive selection, allowing the AI to gather user preferences, clarify requirements, or get decisions without breaking flow.

## When to Use

Use `ask_user_tool` when you need to:
- Gather user preferences during implementation
- Clarify ambiguous requirements  
- Get decisions on implementation choices
- Offer multiple approaches and let the user choose

## Parameters

### `questions` (required)
Array of 1-4 question objects. Each question must have:

- **`question`** (string): The complete question text. Should be clear and specific, ending with a question mark.
  - Example: "Which authentication method should we use?"
  
- **`header`** (string): Very short label for the chip/tag display (max 12 chars).
  - Example: "Auth method", "Library", "Approach"
  
- **`options`** (array): 2-4 option objects, each with:
  - **`label`** (string): The display text users will see (1-5 words)
  - **`description`** (string): Explanation of what this option means or its implications
  
- **`multiSelect`** (boolean): Whether users can select multiple options
  - `false`: Single selection (radio buttons)
  - `true`: Multiple selections allowed (checkboxes)

### `answers` (optional)
Provided automatically by the system when user responds. Do not set manually.

## Examples

### Single Choice Question

```json
{
  "questions": [{
    "question": "Which authentication method should we use?",
    "header": "Auth",
    "options": [
      {
        "label": "JWT (Recommended)", 
        "description": "Stateless, scalable, good for APIs"
      },
      {
        "label": "Session cookies", 
        "description": "Traditional, requires server state"
      }
    ],
    "multiSelect": false
  }]
}
```

### Multiple Choice Question

```json
{
  "questions": [{
    "question": "Which features do you want to enable?",
    "header": "Features",
    "options": [
      {
        "label": "Dark mode", 
        "description": "Toggle UI theme between light and dark"
      },
      {
        "label": "Notifications", 
        "description": "Push notifications for updates"
      },
      {
        "label": "Analytics", 
        "description": "Track usage metrics"
      }
    ],
    "multiSelect": true
  }]
}
```

### Multiple Questions in Sequence

```json
{
  "questions": [
    {
      "question": "Which database should we use?",
      "header": "Database",
      "options": [
        {"label": "PostgreSQL", "description": "Relational, ACID compliant"},
        {"label": "MongoDB", "description": "Document-based, flexible schema"}
      ],
      "multiSelect": false
    },
    {
      "question": "Which ORM library?",
      "header": "ORM",
      "options": [
        {"label": "Prisma", "description": "Type-safe, modern DX"},
        {"label": "TypeORM", "description": "Mature, decorator-based"}
      ],
      "multiSelect": false
    }
  ]
}
```

## Behavior

### User Interaction
- Questions are presented one at a time in the CLI
- Users can select from the provided options
- An "Other (custom input)" option is always available automatically
- For multi-select questions, users can choose multiple options

### Response Flow
1. Tool emits `UserQuestionRequired` event
2. CLI displays the question prompt
3. User selects option(s) or provides custom input
4. CLI sends response via `UserQuestionResponse` event
5. Tool returns success with user's answers

### Timeout
- Questions timeout after 5 minutes if no response
- Returns error if timeout occurs

## Best Practices

### Question Design
✅ **Good**: "Which library should we use for date formatting?"  
❌ **Bad**: "Date library?" (too vague)

✅ **Good**: "Which testing approach do you prefer?"  
❌ **Bad**: "Testing?" (unclear what's being asked)

### Header Text
✅ **Good**: "Auth method" (11 chars)  
❌ **Bad**: "Authentication method" (21 chars, exceeds limit)

### Option Labels
✅ **Good**: "JWT tokens" (concise, clear)  
❌ **Bad**: "Use JWT tokens for authentication with refresh tokens" (too long)

### Option Descriptions
✅ **Good**: "Stateless, scalable, good for microservices"  
❌ **Bad**: "JWT" (description should explain, not repeat label)

### Recommendations
- If you recommend a specific option, make it first and add "(Recommended)" to the label
- For boolean choices, provide clear yes/no or enable/disable options
- Use multi-select sparingly - most questions work better as single-choice
- Provide 2-4 options - too few is limiting, too many is overwhelming

## Integration with Plan Mode

When in plan mode, you can use `ask_user_tool` to clarify ambiguities before finalizing the plan:

```typescript
// In plan mode, before calling ExitPlanMode
const answer = await ask_user_tool({
  questions: [{
    question: "Which state management approach?",
    header: "State",
    options: [
      {"label": "Context API", "description": "Built-in, simple"},
      {"label": "Redux", "description": "Predictable, debuggable"}
    ],
    multiSelect: false
  }]
});

// Update plan based on answer
// Then call ExitPlanMode
```

## Error Handling

The tool validates inputs and returns errors for:
- Empty questions array
- More than 4 questions
- Questions with fewer than 2 or more than 4 options
- Headers longer than 12 characters
- Missing required fields (question, header, options, multiSelect)
- Missing label or description in options
- Invalid multiSelect value (not boolean)

## Notes

- Do not provide an "Other" option manually - it's added automatically by the UI
- Users can always provide custom text input via the "Other" option
- Answers are returned as a record: `{ questionId: answer, ... }`
- Single-select answers are strings
- Multi-select answers are string arrays
- The tool blocks execution until the user responds or timeout occurs
