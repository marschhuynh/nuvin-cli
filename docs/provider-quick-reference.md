# Provider Quick Reference

Quick checklist for adding a new OpenAI-compatible provider.

## Files to Edit

| # | File | What to Add |
|---|------|-------------|
| 1 | `packages/nuvin-core/llm-providers/llm-provider-config.json` | Provider configuration |
| 2 | `packages/nuvin-cli/source/config/providers.ts` | Display labels |
| 3 | `packages/nuvin-cli/source/const.ts` | Auth methods (1 place) |
| 4 | `packages/nuvin-cli/source/const.ts` | Default models (1 place) |
| 5 | `packages/nuvin-cli/source/services/LLMFactory.ts` | Switch case |

## Template

### 1. Core Config
Location: `packages/nuvin-core/llm-providers/llm-provider-config.json`

```json
{
  "name": "provider-name",
  "className": "ProviderLLM",
  "baseUrl": "https://api.provider.com/v1",
  "transportName": "provider-name",
  "features": {
    "promptCaching": false,
    "getModels": true,
    "includeUsage": false
  }
}
```

### 2. Display Labels
Location: `packages/nuvin-cli/source/config/providers.ts`

```typescript
// In PROVIDER_LABELS object:
'provider-name': 'Provider Display Name',

// In PROVIDER_DESCRIPTIONS object:
'provider-name': 'Brief description',
```

### 3. Auth Methods
Location: `packages/nuvin-cli/source/const.ts`

```typescript
// In PROVIDER_AUTH_METHODS object:
'provider-name': [{ label: 'API Key', value: 'token' }],
```

### 4. Default Models
Location: `packages/nuvin-cli/source/const.ts`

```typescript
// In PROVIDER_MODELS object:
'provider-name': ['model-1', 'model-2'],
```

### 5. LLM Factory
Location: `packages/nuvin-cli/source/services/LLMFactory.ts`

```typescript
// Add to switch statement:
case 'provider-name':
  return createLLM(provider, {
    apiKey: config.apiKey,
    httpLogFile: options.httpLogFile,
  });
```

## Build & Test

```bash
pnpm run build
pnpm test
pnpm run dev
```

## Common Values

### Features
- `promptCaching`: Usually `false` (only Anthropic/OpenRouter need `true`)
- `getModels`: `true` if provider has `/models` endpoint
- `includeUsage`: Usually `false` (only OpenRouter needs `true`)

### Auth Methods
Standard API key auth:
```typescript
[{ label: 'API Key', value: 'token' }]
```

Multiple auth options (like Anthropic):
```typescript
[
  { label: 'OAuth Login', value: 'oauth-max' },
  { label: 'Create API Key', value: 'oauth-console' },
  { label: 'Enter API Key', value: 'token' },
]
```

## Verification Checklist

- [ ] Provider appears in `/auth` provider list
- [ ] Can authenticate with API key
- [ ] `/models` command works (if supported)
- [ ] Can send messages and get responses
- [ ] Provider persists in config after restart
- [ ] All tests pass (`pnpm test`)

## Example Providers

| Provider | Prompt Caching | Get Models | Include Usage | Base URL |
|----------|---------------|------------|---------------|----------|
| OpenRouter | ✅ | ✅ | ✅ | `https://openrouter.ai/api/v1` |
| DeepInfra | ❌ | ✅ | ❌ | `https://api.deepinfra.com/v1/openai` |
| Moonshot | ❌ | ✅ | ❌ | `https://api.moonshot.ai/v1` |
| Zai | ❌ | ❌ | ❌ | `https://api.z.ai/api/coding/paas/v4` |

## Need Help?

See full documentation: [adding-new-provider.md](./adding-new-provider.md)
