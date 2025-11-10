# LLM Provider Factory

This directory contains the LLM provider factory pattern that makes it easy to add new OpenAI-compatible providers without writing code.

## Adding a New Provider

To add a new LLM provider, you only need to update one JSON configuration file:

### Add Provider Configuration

Edit `llm-providers/llm-provider-config.json`:

```json
{
  "providers": [
    ...existing providers...,
    {
      "name": "your-provider-name",
      "className": "YourProviderLLM",
      "baseUrl": "https://api.your-provider.com/v1",
      "transportName": "your-provider-name",
      "features": {
        "promptCaching": false,
        "getModels": true,
        "includeUsage": false
      }
    }
  ]
}
```

### That's it! 

The provider is now available:

```typescript
import { createLLM } from '@nuvin/nuvin-core';

const llm = createLLM('your-provider-name', {
  apiKey: 'your-api-key',
  httpLogFile: './logs/http.log' // optional
});

// Use it
const result = await llm.generateCompletion({
  model: 'your-model-name',
  messages: [{ role: 'user', content: 'Hello!' }],
  temperature: 0.7
});

// Get available models (if supported)
const models = await llm.getModels();
```

## Example: Moonshot AI

Here's how Moonshot AI was added in just one step:
```json
{
  "name": "moonshot",
  "className": "MoonshotLLM",
  "baseUrl": "https://api.moonshot.ai/v1",
  "transportName": "moonshot",
  "features": {
    "promptCaching": false,
    "getModels": true
  }
}
```

**Usage:**
```typescript
const llm = createLLM('moonshot', { apiKey: 'sk-...' });
const result = await llm.generateCompletion({
  model: 'moonshot-v1-8k',
  messages: [{ role: 'user', content: '你好' }]
});
```

## Features Explanation

- **promptCaching**: Enable Anthropic-style prompt caching (adds `cache_control` to messages)
- **getModels**: Provider supports `/models` endpoint
- **includeUsage**: Automatically include usage data in requests (OpenRouter specific)

## Factory Functions

- `createLLM(name, options)` - Create an LLM instance
- `getAvailableProviders()` - List all registered providers
- `supportsGetModels(name)` - Check if provider supports model listing

## Special Providers

Some providers require custom implementations due to unique features:

- **GithubLLM** - Uses GitHub-specific authentication
- **AnthropicAISDKLLM** - Uses Anthropic SDK with OAuth support
- **EchoLLM** - Test/mock provider

These are implemented as separate classes and don't use the factory.
