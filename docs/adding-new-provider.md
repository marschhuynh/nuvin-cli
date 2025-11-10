# Adding a New LLM Provider

This guide shows you how to add a new OpenAI-compatible LLM provider to the Nuvin CLI in just a few simple steps.

## Prerequisites

The provider must:
- Support OpenAI-compatible API format (`/chat/completions` endpoint)
- Use Bearer token authentication (API key)
- Optionally support `/models` endpoint for model listing

## Steps

### 1. Add Provider Configuration

Edit `packages/nuvin-core/llm-providers/llm-provider-config.json` and add your provider:

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

**Configuration Fields:**
- `name` - Provider identifier (lowercase, no spaces)
- `className` - Class name for documentation (not used in code)
- `baseUrl` - API base URL (without `/chat/completions`)
- `transportName` - Usually same as `name`
- `features.promptCaching` - Enable Anthropic-style prompt caching
- `features.getModels` - Provider supports `/models` endpoint
- `features.includeUsage` - Automatically include usage data (OpenRouter specific)

### 2. Add UI Configuration

Edit `packages/nuvin-cli/source/config/providers.ts` and add display information:

```typescript
export const PROVIDER_LABELS: Record<Provider, string> = {
  ...existing labels...,
  'your-provider-name': 'Your Provider Display Name',
};

export const PROVIDER_DESCRIPTIONS: Record<Provider, string> = {
  ...existing descriptions...,
  'your-provider-name': 'Brief description for UI',
};
```

### 3. Add Auth Method

Edit `packages/nuvin-cli/source/const.ts` and add authentication method:

```typescript
export const PROVIDER_AUTH_METHODS: Record<Provider, AuthMethodItem[]> = {
  ...existing providers...,
  'your-provider-name': [{ label: 'API Key', value: 'token' }],
};
```

### 4. Add Default Models

Edit `packages/nuvin-cli/source/const.ts` and add default models:

```typescript
export const PROVIDER_MODELS: Record<ProviderKey, string[]> = {
  ...existing providers...,
  'your-provider-name': ['model-1', 'model-2', 'model-3'],
};
```

### 5. Update LLM Factory

Edit `packages/nuvin-cli/source/services/LLMFactory.ts` and add to the switch statement:

```typescript
createLLM(provider: ProviderKey, options: LLMOptions = {}): LLMPort {
  const config = this.getProviderConfig(provider);

  switch (provider) {
    case 'openrouter':
    case 'deepinfra':
    case 'zai':
    case 'moonshot':
    case 'your-provider-name':  // Add your provider here
      return createLLM(provider, {
        apiKey: config.apiKey,
        httpLogFile: options.httpLogFile,
      });
    ...
  }
}
```

### 6. Build and Test

```bash
# Build the packages
pnpm run build

# Run tests
pnpm test

# Try the provider
pnpm run dev
```

In the CLI:
1. Run `/auth` command
2. Select your provider from the list
3. Enter API key
4. Run `/models` to verify connection
5. Start chatting!

## Example: Moonshot AI

Here's a real example of adding Moonshot AI:

### Step 1: Provider Config
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

### Step 2: UI Labels
```typescript
PROVIDER_LABELS: {
  moonshot: 'Moonshot',
}

PROVIDER_DESCRIPTIONS: {
  moonshot: 'Moonshot AI models',
}
```

### Step 3: Auth Method
```typescript
PROVIDER_AUTH_METHODS: {
  moonshot: [{ label: 'API Key', value: 'token' }],
}
```

### Step 4: Default Models
```typescript
PROVIDER_MODELS: {
  moonshot: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
}
```

### Step 5: LLM Factory
```typescript
case 'moonshot':
  return createLLM(provider, {
    apiKey: config.apiKey,
    httpLogFile: options.httpLogFile,
  });
```

**That's it!** The provider is now fully integrated.

## Usage Example

```typescript
import { createLLM } from '@nuvin/nuvin-core';

const llm = createLLM('your-provider-name', {
  apiKey: 'your-api-key',
  httpLogFile: './logs/http.log' // optional
});

const result = await llm.generateCompletion({
  model: 'your-model-name',
  messages: [{ role: 'user', content: 'Hello!' }],
  temperature: 0.7
});

console.log(result.content);
```

## Advanced: Custom Provider Implementation

If your provider requires special authentication or has unique features not supported by the factory pattern, you can create a custom LLM class:

1. Extend `BaseLLM` in `packages/nuvin-core/llm-providers/`
2. Implement custom `createTransport()` method
3. Add to `packages/nuvin-core/llm-providers/index.ts`
4. Handle separately in CLI's `LLMFactory.ts`

See `GithubLLM` or `AnthropicAISDKLLM` for examples.

## Troubleshooting

### Provider not showing in CLI
- Check that you added it to all 4 configuration files
- Rebuild packages: `pnpm run build`
- Check console for TypeScript errors

### Authentication fails
- Verify `baseUrl` is correct (without `/chat/completions`)
- Ensure API key format matches provider requirements
- Check network logs with `httpLogFile` option

### Models not loading
- Verify provider supports `/models` endpoint
- Set `features.getModels: true` in config
- Check API key has permission to list models

## Contributing

When adding a popular provider, please:
1. Add tests in `packages/nuvin-core/tests/`
2. Update this documentation
3. Submit a pull request with:
   - Provider name and website
   - Example API key format
   - Recommended models

## Summary

Adding a provider requires editing **5 files**:
1. `packages/nuvin-core/llm-providers/llm-provider-config.json` - Core config
2. `packages/nuvin-cli/source/config/providers.ts` - Labels & descriptions  
3. `packages/nuvin-cli/source/const.ts` - Auth methods & models (2 sections)
4. `packages/nuvin-cli/source/services/LLMFactory.ts` - Switch case

Total code changes: **~20 lines of JSON/TypeScript** ✨
