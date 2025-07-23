import { describe, it, expect } from 'vitest';
import { ProviderFactory } from '../provider-factory';
import { OpenRouterProvider } from '../openrouter-provider';
import { OpenAIProvider } from '../openai-provider';
import { AnthropicProvider } from '../anthropic-provider';
import { GithubCopilotProvider } from '../github-provider';

describe('ProviderFactory', () => {
  it('should create OpenRouter provider', () => {
    const provider = ProviderFactory.createProvider({
      type: 'openrouter',
      apiKey: 'test-key',
    });

    expect(provider).toBeInstanceOf(OpenRouterProvider);
  });

  it('should create OpenAI provider', () => {
    const provider = ProviderFactory.createProvider({
      type: 'openai',
      apiKey: 'test-key',
    });

    expect(provider).toBeInstanceOf(OpenAIProvider);
  });

  it('should create Anthropic provider', () => {
    const provider = ProviderFactory.createProvider({
      type: 'anthropic',
      apiKey: 'test-key',
    });

    expect(provider).toBeInstanceOf(AnthropicProvider);
  });

  it('should create GitHub provider', () => {
    const provider = ProviderFactory.createProvider({
      type: 'github',
      apiKey: 'test-key',
    });

    expect(provider).toBeInstanceOf(GithubCopilotProvider);
  });

  it('should throw error for unsupported provider type', () => {
    expect(() => {
      ProviderFactory.createProvider({
        type: 'unsupported' as any,
        apiKey: 'test-key',
      });
    }).toThrow('Unsupported provider type: unsupported');
  });

  it('should return correct provider types', () => {
    const types = ProviderFactory.getProviderTypes();
    expect(types).toEqual(['openrouter', 'openai', 'anthropic', 'github']);
  });

  it('should return correct display names', () => {
    expect(ProviderFactory.getProviderDisplayName('openrouter')).toBe(
      'OpenRouter',
    );
    expect(ProviderFactory.getProviderDisplayName('openai')).toBe('OpenAI');
    expect(ProviderFactory.getProviderDisplayName('anthropic')).toBe(
      'Anthropic',
    );
    expect(ProviderFactory.getProviderDisplayName('github')).toBe(
      'GitHub Copilot',
    );
  });

  it('should validate provider config correctly', () => {
    expect(
      ProviderFactory.validateProviderConfig({
        type: 'openai',
        apiKey: 'valid-key',
      }),
    ).toBe(true);

    expect(
      ProviderFactory.validateProviderConfig({
        type: 'openai',
        apiKey: '',
      }),
    ).toBe(false);

    expect(
      ProviderFactory.validateProviderConfig({
        type: 'invalid' as any,
        apiKey: 'valid-key',
      }),
    ).toBe(false);
  });
});
``;
