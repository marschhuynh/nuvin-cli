# Custom LLM Provider Support

## Overview
Allow users to define custom LLM providers in their config.yaml file while maintaining backward compatibility with built-in providers.

## Current State
- Built-in providers defined in `llm-provider-config.json` (deepinfra, openrouter, zai, moonshot)
- All current providers are OpenAI-compatible
- `config.yaml` only supports auth configuration for providers
- `BaseLLM` implements OpenAI-compatible API

## Goals
1. Enable users to add custom OpenAI-compatible providers via config.yaml
2. Support flexible model configuration (pre-defined list, endpoint URL, or dynamic fetch)
3. Maintain backward compatibility with existing built-in providers
4. Merge built-in and custom providers seamlessly

## Design

### 1. Provider Categories
- `openai-compat`: OpenAI-compatible providers (current BaseLLM)
- `anthropic`: Anthropic-specific providers (future support)

### 2. Config Schema Updates

#### ProviderConfig Interface (packages/nuvin-cli/source/config/types.ts)
```typescript
export interface ProviderConfig {
  // Existing auth fields
  apiKey?: string;
  token?: string;
  model?: string;
  defaultModel?: string;
  'current-auth'?: string;
  auth?: AuthMethod[];
  oauth?: { ... };
  
  // NEW: Custom provider definition
  type?: 'openai-compat' | 'anthropic';  // Default: 'openai-compat'
  baseUrl?: string;                       // Custom base URL
  models?: ModelConfig;                   // Model configuration
  
  [key: string]: unknown;
}

type ModelConfig = 
  | false                      // No model listing support
  | true                       // Use default /models endpoint
  | string                     // Custom endpoint path (e.g., "/v1/models")
  | string[]                   // Pre-defined model ID list
  | ModelDefinition[];         // Detailed model definitions

interface ModelDefinition {
  id: string;
  name?: string;
  [key: string]: unknown;
}
```

#### Built-in Provider Config (packages/nuvin-core/llm-providers/llm-provider-config.json)
```json
{
  "providers": [
    {
      "name": "openrouter",
      "type": "openai-compat",
      "baseUrl": "https://openrouter.ai/api/v1",
      "features": {
        "promptCaching": true,
        "getModels": true,
        "includeUsage": true
      }
    }
  ]
}
```

### 3. User Config Example

Users can define custom providers in `~/.nuvin-cli/config.yaml`:

```yaml
providers:
  # Custom provider with pre-defined models
  my-custom-llm:
    type: openai-compat
    baseUrl: https://my-llm.com/v1
    apiKey: sk-xxx
    models:
      - gpt-4-custom
      - gpt-3.5-custom
      - claude-3-custom
  
  # Custom provider with dynamic model endpoint
  another-provider:
    type: openai-compat
    baseUrl: https://another.ai/api
    apiKey: key-123
    models: /custom/models/endpoint
  
  # Custom provider with detailed model definitions
  detailed-provider:
    type: openai-compat
    baseUrl: https://detailed.ai/v1
    apiKey: token-xyz
    models:
      - id: model-1
        name: "Custom Model 1"
        context_length: 128000
      - id: model-2
        name: "Custom Model 2"
        context_length: 200000
  
  # Custom provider without model listing
  simple-provider:
    type: openai-compat
    baseUrl: https://simple.ai/v1
    apiKey: abc123
    models: false
```

### 4. Implementation Steps

#### Step 1: Update Type Definitions
- **File**: `packages/nuvin-cli/source/config/types.ts`
- Add `type`, `baseUrl`, `models` fields to `ProviderConfig`
- Create `ModelConfig` and `ModelDefinition` types
- Export new types

#### Step 2: Update Built-in Provider Config
- **File**: `packages/nuvin-core/llm-providers/llm-provider-config.json`
- Add `type: "openai-compat"` to all providers
- Keep existing structure for backward compatibility

#### Step 3: Update ProviderConfig Interface in Core
- **File**: `packages/nuvin-core/llm-providers/llm-factory.ts`
- Update `ProviderConfig` interface to match CLI types
- Add `type` field with default value

#### Step 4: Create Provider Merger
- **File**: `packages/nuvin-core/llm-providers/llm-factory.ts`
- Create function to merge built-in and custom providers
- Handle model configuration normalization
- Validate custom provider definitions

#### Step 5: Update GenericLLM Class
- **File**: `packages/nuvin-core/llm-providers/llm-factory.ts`
- Update constructor to accept model configuration
- Implement different model fetching strategies:
  - Pre-defined list: return cached list
  - Endpoint string: fetch from custom path
  - Boolean true: use default `/models`
  - Boolean false: throw error

#### Step 6: Update createLLM Factory Function
- **File**: `packages/nuvin-core/llm-providers/llm-factory.ts`
- Accept optional custom providers parameter
- Merge with built-in providers
- Prefer custom provider if name conflicts

#### Step 7: Wire Up Config in CLI
- **File**: `packages/nuvin-cli/source/llm/llm-factory.ts` (or equivalent)
- Load custom providers from ConfigManager
- Pass to core createLLM function
- Handle provider resolution with custom providers

#### Step 8: Update Documentation
- **File**: `docs/adding-new-provider.md`
- Add section on custom provider configuration
- Provide examples for different model config types
- Document limitations and requirements

### 5. Model Configuration Behavior

| Config Value | Behavior | Example |
|-------------|----------|---------|
| `false` | No model listing | Cannot call `getModels()` |
| `true` | Fetch from `/models` | Standard OpenAI endpoint |
| `"/custom/path"` | Fetch from custom path | Custom endpoint |
| `["model-1", "model-2"]` | Return pre-defined list | Static model list |
| `[{id: "model-1", ...}]` | Return detailed list | Rich model metadata |

### 6. Provider Priority
1. Custom providers from user config (highest)
2. Built-in providers from llm-provider-config.json

If a custom provider has the same name as a built-in provider, the custom provider takes precedence.

### 7. Validation Rules
- `type` must be `"openai-compat"` or `"anthropic"` (currently only openai-compat supported)
- `baseUrl` is required for custom providers
- `models` defaults to `false` if not specified
- Provider names must be unique (case-insensitive)
- Custom endpoint paths must start with `/`

### 8. Backward Compatibility
- Existing configurations continue to work
- Built-in providers remain available
- Auth-only provider configs are still valid
- No breaking changes to existing API

### 9. Implementation Completed
- ✅ Core provider merging and model configuration
- ✅ Custom provider support in config.yaml
- ✅ LM Studio added as built-in provider
- ✅ `/model` command dynamically loads custom providers
- ✅ Auth methods default to API key for custom providers
- ✅ Model listing fetched dynamically or from pre-defined list
- ✅ All existing tests passing + 18 new tests for custom providers

### 10. Usage Examples

#### Using LM Studio (built-in)
```bash
# LM Studio is now available in /model command
# No API key needed (localhost)
/model
# Select "LM Studio - Local LLM server"
```

#### Adding Custom Provider
```yaml
# ~/.nuvin-cli/config.yaml
providers:
  my-llm:
    type: openai-compat
    baseUrl: https://my-custom-llm.com/v1
    apiKey: your-api-key-here
    models:
      - custom-model-1
      - custom-model-2
```

Then use `/model` command - "my-llm" will appear in the provider list.

### 11. Future Enhancements
- Support for Anthropic provider type
- Model capability/feature detection
- Provider-specific parameter overrides
- Model aliasing and remapping
- Custom provider auth method configuration
