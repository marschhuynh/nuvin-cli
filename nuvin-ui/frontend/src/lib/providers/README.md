# LLM Provider Architecture

This directory contains the LLM provider system with a base provider pattern that reduces code duplication and provides consistent interfaces across different LLM providers.

## Architecture Overview

### BaseLLMProvider
The `BaseLLMProvider` class provides common functionality for all LLM providers:

- **HTTP Client**: Shared HTTP client with consistent headers and error handling
- **Streaming Utilities**: Common SSE (Server-Sent Events) parsing utilities
- **Model Management**: Common model transformation and sorting utilities
- **Error Handling**: Consistent error handling across providers
- **Data Transformation**: Common data transformation utilities

### Provider Factory
The `ProviderFactory` class provides a simple way to create provider instances:

```typescript
import { ProviderFactory } from './provider-factory';

// Create a provider
const provider = ProviderFactory.createProvider({
  type: 'openai',
  apiKey: 'your-api-key',
});

// Get available models
const models = await provider.getModels();
```

### Available Providers

1. **OpenRouterProvider** - Access to 100+ models from various providers
2. **OpenAIProvider** - Direct access to OpenAI models
3. **AnthropicProvider** - Access to Claude models
4. **GithubCopilotProvider** - GitHub Copilot models

## Usage Examples

### Basic Usage
```typescript
import { ProviderFactory } from './provider-factory';

const provider = ProviderFactory.createProvider({
  type: 'openai',
  apiKey: process.env.OPENAI_API_KEY!,
});

// Get available models
const models = await provider.getModels();

// Generate completion
const result = await provider.generateCompletion({
  model: 'gpt-4o',
  messages: [
    { role: 'user', content: 'Hello, world!' },
  ],
  temperature: 0.7,
  maxTokens: 100,
  topP: 1.0,
});
```

### Streaming Usage
```typescript
// Stream text
for await (const chunk of provider.generateCompletionStream(params)) {
  console.log(chunk);
}

// Stream with tools
for await (const chunk of provider.generateCompletionStreamWithTools(params)) {
  if (chunk.content) {
    console.log(chunk.content);
  }
  if (chunk.tool_calls) {
    console.log('Tool calls:', chunk.tool_calls);
  }
}
```

### Creating a New Provider
To create a new provider, extend the `BaseLLMProvider` class:

```typescript
import { BaseLLMProvider } from './base-provider';

class MyProvider extends BaseLLMProvider {
  constructor(apiKey: string) {
    super({
      providerName: 'MyProvider',
      apiKey,
      apiUrl: 'https://api.myprovider.com',
    });
  }

  async generateCompletion(params: CompletionParams): Promise<CompletionResult> {
    const response = await this.makeRequest('/chat/completions', {
      body: {
        model: params.model,
        messages: params.messages,
        temperature: params.temperature,
        max_tokens: params.maxTokens,
        top_p: params.topP,
      },
    });

    const data = await response.json();
    return this.createCompletionResult(data);
  }

  async getModels(): Promise<ModelInfo[]> {
    const response = await this.makeRequest('/models', { method: 'GET' });
    const data = await response.json();

    return data.models.map((model: any) =>
      this.formatModelInfo(model, {
        contextLength: 4000,
        inputCost: 0.01,
        outputCost: 0.02,
      })
    );
  }
}
```

## Key Benefits

1. **Code Reuse**: Common functionality is implemented once in the base class
2. **Consistency**: All providers have the same interface and behavior
3. **Maintainability**: Changes to common functionality only need to be made in one place
4. **Extensibility**: New providers can be added easily by extending the base class
5. **Type Safety**: Full TypeScript support with proper type definitions

## File Structure

```
providers/
├── base-provider.ts          # Base provider class with common functionality
├── llm-provider.ts           # Core interfaces and types
├── provider-factory.ts       # Factory for creating provider instances
├── provider-utils.ts         # Utility functions
├── openrouter-provider.ts    # OpenRouter provider implementation
├── openai-provider.ts        # OpenAI provider implementation
├── anthropic-provider.ts     # Anthropic provider implementation
├── github-provider.ts        # GitHub Copilot provider implementation
└── index.ts                  # Export all providers and types