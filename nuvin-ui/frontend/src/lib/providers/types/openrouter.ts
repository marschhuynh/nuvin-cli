export interface ChatCompletionResponse {
  id: string;
  provider: string;
  model: string;
  object: string;
  created: number;
  choices: Array<{
    logprobs: null;
    finish_reason: string;
    native_finish_reason: string;
    index: number;
    message: {
      role: string;
      content: string | null;
      refusal: null;
      reasoning: null;
      tool_calls?: Array<{
        index: number;
        id: string;
        function: {
          arguments: string;
          name: string;
        };
        type: string;
      }>;
    };
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details: null;
  };
}
