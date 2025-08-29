import { GetCopilotToken } from '@wails/services/githuboauthservice';
import type { ProviderConfig, GithubProviderConfig } from '@/types';
import { useProviderStore } from '@/store/useProviderStore';
import { validateAndCleanGitHubToken } from '../github';
import { smartFetch, createProxyFetch } from '../fetch-proxy';
import { isWailsEnvironment } from '../browser-runtime';
import type { ChatCompletionResponse, ChatCompletionUsage } from './types/openrouter';
import { BaseLLMProvider } from './base-provider';
import type {
  CompletionParams,
  CompletionResult,
  StreamChunk,
  ModelInfo,
  ToolDefinition,
  ChatMessage,
} from './types/base';
import { extractValue } from './utils';

type RequestBody = {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
};

interface GitHubModel {
  id: string;
  supported_parameters?: string[];
  [key: string]: unknown;
}

interface DeviceFlowStartResponse {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

interface DeviceFlowPollResponse {
  accessToken?: string;
  status: 'pending' | 'complete' | 'error';
  error?: string;
}

interface GitHubTokenResponse {
  accessToken: string;
  apiKey: string;
}

export class GithubCopilotProvider extends BaseLLMProvider {
  private providerConfig: GithubProviderConfig;
  private serverBaseUrl: string = import.meta.env.VITE_SERVER_URL;
  private proxyFetch: typeof fetch;

  constructor(providerConfig: ProviderConfig) {
    const cleanApiKey = validateAndCleanGitHubToken(providerConfig.apiKey);

    super({
      providerName: 'GitHub',
      apiKey: cleanApiKey,
      apiUrl: 'https://api.githubcopilot.com',
    });

    this.providerConfig = providerConfig;

    this.proxyFetch = createProxyFetch(this.serverBaseUrl);
  }

  /**
   * Browser-compatible GitHub Copilot token exchange
   * Uses the server proxy to bypass CORS
   */
  private async getCopilotTokenBrowser(accessToken: string): Promise<GitHubTokenResponse> {
    const response = await smartFetch(`${this.serverBaseUrl}/github/copilot-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ accessToken }),
    });

    if (!response.ok) {
      throw new Error(`Failed to get Copilot token: ${response.status}`);
    }

    return response.json();
  }

  /**
   * Browser-compatible GitHub device flow authentication
   * Uses server endpoints to handle the OAuth flow
   */
  private async fetchGithubCopilotKeyBrowser(): Promise<GitHubTokenResponse> {
    // Step 1: Start device flow
    const startResponse = await smartFetch(`${this.serverBaseUrl}/github/device-flow/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!startResponse.ok) {
      throw new Error(`Failed to start device flow: ${startResponse.status}`);
    }

    const deviceFlow: DeviceFlowStartResponse = await startResponse.json();

    // Step 2: Open browser tab and show user code
    window.open(deviceFlow.verificationUri, '_blank');

    // Show user code to user (you might want to show this in a modal/dialog)
    alert(`Please enter this code in the GitHub authorization page: ${deviceFlow.userCode}`);

    // Step 3: Poll for completion
    const pollInterval = (deviceFlow.interval || 5) * 1000; // Convert to milliseconds
    const maxAttempts = Math.floor((deviceFlow.expiresIn || 900) / (deviceFlow.interval || 5));

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const pollResponse = await smartFetch(`${this.serverBaseUrl}/github/device-flow/poll/${deviceFlow.deviceCode}`, {
        method: 'GET',
      });

      if (!pollResponse.ok) {
        throw new Error(`Failed to poll device flow: ${pollResponse.status}`);
      }

      const pollResult: DeviceFlowPollResponse = await pollResponse.json();

      if (pollResult.status === 'complete' && pollResult.accessToken) {
        // Success! Now get the Copilot token
        return this.getCopilotTokenBrowser(pollResult.accessToken);
      } else if (pollResult.status === 'error') {
        throw new Error(`GitHub authentication failed: ${pollResult.error}`);
      }
      // If status is 'pending', continue polling
    }

    throw new Error('GitHub authentication timed out');
  }

  /**
   * Get Copilot token - works in both Wails and browser environments
   */
  private async getCopilotToken(accessToken: string): Promise<GitHubTokenResponse> {
    if (isWailsEnvironment()) {
      // Use Wails service in desktop app
      const result = await GetCopilotToken(accessToken);
      return {
        accessToken: result.accessToken,
        apiKey: result.apiKey,
      };
    } else {
      // Use server endpoint in browser
      return this.getCopilotTokenBrowser(accessToken);
    }
  }

  protected getCommonHeaders(): Record<string, string> {
    return {
      ...super.getCommonHeaders(),
      'editor-version': 'vscode/1.100.3',
      'editor-plugin-version': 'GitHub.copilot/1.330.0',
      'user-agent': 'GithubCopilot/1.330.0',
    };
  }

  protected async makeRequest(
    endpoint: string,
    options: {
      method?: string;
      body?: RequestBody;
      signal?: AbortSignal;
      headers?: Record<string, string>;
    } = {},
    isRetry = false,
  ): Promise<Response> {
    const headers = { ...this.getCommonHeaders(), ...options.headers } as Record<string, string>;

    // If this is a streaming request, prefer SSE accept header and mark init as streaming
    const isStreaming = Boolean(options.body && options.body.stream === true);
    if (isStreaming) {
      headers.accept = 'text/event-stream';
    }

    const url = `${this.apiUrl}${endpoint}`;
    const isDesktop = isWailsEnvironment();
    const _fetch = isDesktop ? fetch : this.proxyFetch;

    const response = await _fetch(url, {
      method: options.method || 'POST',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
      ...(isStreaming ? { stream: true } : {}),
    });

    if (!response.ok) {
      const text = await response.text();
      if (response.status === 401 && !isRetry && this.providerConfig.accessToken) {
        const newToken = await this.getCopilotToken(this.providerConfig.accessToken);
        console.log('Token expired, trying to get a new token', newToken);
        this.apiKey = validateAndCleanGitHubToken(newToken.apiKey);
        useProviderStore.getState().updateProvider({
          ...this.providerConfig,
          apiKey: newToken.apiKey,
        });
        return this.makeRequest(endpoint, options, true);
      }
      if (response.status === 403) {
        throw new Error(
          `GitHub Copilot API access denied. Please ensure you have a valid GitHub Copilot subscription and the correct authentication token. Status: ${response.status}`,
        );
      }
      throw new Error(`GitHub Copilot API error: ${response.status} - ${text}`);
    }

    return response;
  }

  async generateCompletion(params: CompletionParams, signal?: AbortSignal): Promise<CompletionResult> {
    const startTime = Date.now();
    const requestBody: RequestBody = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      stream: false,
    };

    // Only add tools if they exist and are not empty
    if (params.tools && params.tools.length > 0) {
      requestBody.tools = params.tools;
    }

    // Only add tool_choice if tools are present
    if (params.tool_choice && params.tools && params.tools.length > 0) {
      requestBody.tool_choice = params.tool_choice;
    }

    const response = await this.makeRequest('/chat/completions', {
      body: requestBody,
      signal,
    });

    const data: ChatCompletionResponse = await response.json();

    const result = this.createCompletionResult<ChatCompletionResponse>(data, startTime);

    return result;
  }

  async *generateCompletionStream(params: CompletionParams, signal?: AbortSignal): AsyncGenerator<string> {
    const requestBody: RequestBody = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      stream: true,
    };

    // Only add tools if they exist and are not empty
    if (params.tools && params.tools.length > 0) {
      requestBody.tools = params.tools;
    }

    // Only add tool_choice if tools are present
    if (params.tool_choice && params.tools && params.tools.length > 0) {
      requestBody.tool_choice = params.tool_choice;
    }

    const response = await this.makeRequest('/chat/completions', {
      body: requestBody,
      signal,
    });

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();

    for await (const data of this.parseStream(reader, {}, signal)) {
      const content = extractValue(data, 'choices.0.delta.content');
      if (content) {
        yield content;
      }
    }
  }

  async *generateCompletionStreamWithTools(
    params: CompletionParams,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk> {
    const startTime = Date.now();

    const requestBody: RequestBody = {
      model: params.model,
      messages: params.messages,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      top_p: params.topP,
      stream: true,
    };

    // Only add tools if they exist and are not empty
    if (params.tools && params.tools.length > 0) {
      requestBody.tools = params.tools;
    }

    // Only add tool_choice if tools are present
    if (params.tool_choice && params.tools && params.tools.length > 0) {
      requestBody.tool_choice = params.tool_choice;
    }

    const response = await this.makeRequest('/chat/completions', {
      body: requestBody,
      signal,
    });

    if (!response.body) {
      throw new Error('No response body for streaming');
    }

    const reader = response.body.getReader();

    for await (const chunk of this.parseStreamWithTools(reader, {}, signal, startTime)) {
      yield chunk;
    }
  }

  async getModels(): Promise<ModelInfo[]> {
    const response = await this.makeRequest('/models', {
      method: 'GET',
    });

    const data = await response.json();
    const models = (data.data || []) as GitHubModel[];

    const transformedModels = models.map((model): ModelInfo => {
      return this.formatModelInfo(model, {
        contextLength: this.getContextLength(model.id),
        inputCost: 0, // GitHub Copilot subscription covers usage
        outputCost: 0,
        modality: this.getModality(model.id),
        inputModalities: this.getInputModalities(model.id),
        outputModalities: this.getOutputModalities(model.id),
        supportedParameters: model.supported_parameters || [],
      });
    });

    return this.sortModels(transformedModels);
  }

  private getContextLength(modelId: string): number {
    const contextMap: Record<string, number> = {
      'openai/gpt-4.1': 200000,
      'openai/gpt-4.1-mini': 200000,
      'openai/gpt-4.1-nano': 200000,
      'openai/gpt-4o': 128000,
      'openai/gpt-4o-mini': 128000,
      'openai/o1': 200000,
      'openai/o1-mini': 128000,
      'openai/o1-preview': 128000,
      'openai/o3': 200000,
      'openai/o3-mini': 128000,
      'openai/o4-mini': 200000,
      'ai21-labs/ai21-jamba-1.5-large': 256000,
      'ai21-labs/ai21-jamba-1.5-mini': 256000,
      'cohere/cohere-command-a': 128000,
      'cohere/cohere-command-r-08-2024': 128000,
    };
    return contextMap[modelId] || 128000;
  }

  private getModality(modelId: string): string {
    if (modelId?.includes('gpt-4o') || modelId?.includes('o1') || modelId?.includes('o3') || modelId?.includes('o4')) {
      return 'multimodal';
    }
    return 'text';
  }

  private getInputModalities(modelId: string): string[] {
    const modalities = ['text'];
    if (modelId?.includes('gpt-4o') || modelId?.includes('o1') || modelId?.includes('o3') || modelId?.includes('o4')) {
      modalities.push('image');
    }
    return modalities;
  }

  private getOutputModalities(_modelId: string): string[] {
    return ['text'];
  }

  protected calculateCost(usage: ChatCompletionUsage, model?: string): number | undefined {
    if (!usage || !model) return undefined;

    // GitHub Copilot subscription covers usage - treat as zero cost
    return 0;
  }

  /**
   * Authenticate with GitHub Copilot (browser environments)
   * This method handles the complete device flow authentication
   */
  async authenticateGitHubCopilot(): Promise<void> {
    if (isWailsEnvironment()) {
      // In Wails, authentication is handled by the desktop app
      throw new Error('Use the desktop app authentication dialog for GitHub Copilot');
    }

    try {
      const result = await this.fetchGithubCopilotKeyBrowser();

      // Update the provider configuration
      this.apiKey = validateAndCleanGitHubToken(result.apiKey);
      useProviderStore.getState().updateProvider({
        ...this.providerConfig,
        apiKey: result.apiKey,
        accessToken: result.accessToken,
      });

      console.log('GitHub Copilot authentication successful');
    } catch (error) {
      console.error('GitHub Copilot authentication failed:', error);
      throw error;
    }
  }
}
