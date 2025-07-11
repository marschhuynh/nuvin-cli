import { LLMProvider, CompletionParams, CompletionResult } from './llm-provider';
import { fetchProxy } from '../fetch-proxy';

export class GithubCopilotProvider implements LLMProvider {
  readonly type = 'GitHub';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async generateCompletion(params: CompletionParams): Promise<CompletionResult> {
    const response = await fetchProxy('https://api.githubcopilot.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`GitHub Copilot API error: ${response.status} - ${text}`);
    }

    const data = await response.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';
    return { content };
  }
}
