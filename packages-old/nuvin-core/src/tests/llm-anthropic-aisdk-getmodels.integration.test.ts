import { describe, it, expect } from 'vitest';
import { AnthropicAISDKLLM } from '../llm-providers/llm-anthropic-aisdk.js';

describe('AnthropicAISDKLLM - getModels Integration', () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const oauthAccessToken = process.env.ANTHROPIC_OAUTH_ACCESS_TOKEN;
  const oauthRefreshToken = process.env.ANTHROPIC_OAUTH_REFRESH_TOKEN;

  const hasApiKey = !!apiKey;
  const hasOAuth = !!(oauthAccessToken && oauthRefreshToken);

  it.skipIf(!hasApiKey)('should fetch real models with API key', async () => {
    const llm = new AnthropicAISDKLLM({ apiKey });
    const models = await llm.getModels();

    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('name');
    expect(models[0]).toHaveProperty('limits');

    const hasClaudeOpus4 = models.some((m) => m.id.includes('claude-opus-4'));
    const hasClaudeSonnet = models.some((m) => m.id.includes('claude-sonnet'));
    const hasClaudeHaiku = models.some((m) => m.id.includes('claude-haiku'));

    expect(hasClaudeOpus4 || hasClaudeSonnet || hasClaudeHaiku).toBe(true);

    for (const model of models) {
      expect(model.limits?.contextWindow).toBeGreaterThan(0);
    }
  });

  it.skipIf(!hasOAuth)('should fetch real models with OAuth', async () => {
    const llm = new AnthropicAISDKLLM({
      oauth: {
        type: 'oauth',
        access: oauthAccessToken!,
        refresh: oauthRefreshToken!,
        expires: Date.now() + 3600000,
      },
    });
    const models = await llm.getModels();

    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toHaveProperty('id');
    expect(models[0]).toHaveProperty('name');
    expect(models[0]).toHaveProperty('limits');
  });

  it.skipIf(!hasApiKey)('should handle abort signal', async () => {
    const llm = new AnthropicAISDKLLM({ apiKey });
    const controller = new AbortController();

    const modelsPromise = llm.getModels(controller.signal);
    controller.abort();

    await expect(modelsPromise).rejects.toThrow();
  });
});
