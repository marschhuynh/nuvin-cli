import { describe, it, expect } from 'vitest';
import { AnthropicAISDKLLM } from '../llm-providers/llm-anthropic-aisdk';
import type { CompletionParams } from '../ports.js';

describe('AnthropicAISDKLLM Integration Tests', () => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const oauthAccessToken = process.env.ANTHROPIC_OAUTH_ACCESS_TOKEN;
  const oauthRefreshToken = process.env.ANTHROPIC_OAUTH_REFRESH_TOKEN;

  // Skip tests if no API key is provided
  const testIf = apiKey ? it : it.skip;
  const testOAuthIf = oauthAccessToken && oauthRefreshToken ? it : it.skip;

  testIf(
    'should successfully call Anthropic API with cache control',
    async () => {
      const llm = new AnthropicAISDKLLM({
        apiKey,
      });

      const params: CompletionParams = {
        model: 'claude-3-5-haiku-20241022', // Use Haiku for faster/cheaper tests
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say hello in one word.' },
        ],
        maxTokens: 50,
      };

      const result = await llm.generateCompletion(params);

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.usage).toBeDefined();
      expect(result.usage.prompt_tokens).toBeGreaterThan(0);
      expect(result.usage.completion_tokens).toBeGreaterThan(0);

      // Log usage to see cache behavior
      console.log('First call usage:', result.usage);
    },
    30000,
  ); // 30 second timeout

  testIf(
    'should demonstrate cache hits on subsequent calls',
    async () => {
      const llm = new AnthropicAISDKLLM({
        apiKey,
      });

      const baseParams: CompletionParams = {
        model: 'claude-3-5-haiku-20241022',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that answers questions about fruits.' },
          {
            role: 'system',
            content:
              'Here is a long document about fruits: Apples are red, green, or yellow. They grow on trees. Bananas are yellow and grow in bunches. Oranges are citrus fruits that are orange in color. Grapes come in green, red, and purple varieties. Strawberries are red berries with seeds on the outside. Blueberries are small blue berries. Watermelons are large fruits with green skin and red flesh. Pineapples are tropical fruits with spiky skin. Mangoes are tropical fruits with sweet flesh. Peaches are fuzzy fruits with a pit. Pears are similar to apples but have a different shape. Cherries are small red or black fruits with pits. Kiwis are brown fuzzy fruits with green flesh. Plums are purple or red fruits with pits.',
          },
          { role: 'user', content: 'What color are apples?' },
        ],
        maxTokens: 100,
      };

      // First call - should create cache
      const result1 = await llm.generateCompletion(baseParams);
      console.log('\nFirst call usage:', result1.usage);
      expect(result1.content).toBeDefined();

      // Wait a moment to ensure first call completes
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Second call with same prefix - should hit cache
      const params2: CompletionParams = {
        ...baseParams,
        messages: [
          ...baseParams.messages.slice(0, 2), // Same system messages
          { role: 'user', content: 'What color are bananas?' },
        ],
      };

      const result2 = await llm.generateCompletion(params2);
      console.log('Second call usage:', result2.usage);
      expect(result2.content).toBeDefined();

      // Note: We can't easily assert on cache_read_input_tokens from the outside
      // because our abstraction returns a simplified usage object.
      // But we can verify the calls succeeded and log the usage for manual verification.
    },
    60000,
  ); // 60 second timeout

  testIf(
    'should handle tool calls with cache control',
    async () => {
      const llm = new AnthropicAISDKLLM({
        apiKey,
      });

      const params: CompletionParams = {
        model: 'claude-3-5-haiku-20241022',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'What is the weather in Paris?' },
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'get_weather',
              description: 'Get the current weather in a given location',
              parameters: {
                type: 'object',
                properties: {
                  location: {
                    type: 'string',
                    description: 'The city and state, e.g. San Francisco, CA',
                  },
                },
                required: ['location'],
              },
            },
          },
        ],
        maxTokens: 200,
      };

      const result = await llm.generateCompletion(params);

      expect(result.content).toBeDefined();
      expect(result.usage).toBeDefined();
      console.log('\nTool call usage:', result.usage);

      // The model might or might not use the tool, but the call should succeed
      if (result.tool_calls && result.tool_calls.length > 0) {
        expect(result.tool_calls[0].function.name).toBe('get_weather');
        console.log('Tool calls:', result.tool_calls);
      }
    },
    30000,
  );

  testIf(
    'should handle multi-turn conversation with cache control',
    async () => {
      const llm = new AnthropicAISDKLLM({
        apiKey,
      });

      // First turn
      const params1: CompletionParams = {
        model: 'claude-3-5-haiku-20241022',
        messages: [
          { role: 'system', content: 'You are a helpful math tutor.' },
          { role: 'user', content: 'What is 2+2?' },
        ],
        maxTokens: 100,
      };

      const result1 = await llm.generateCompletion(params1);
      console.log('\nFirst turn usage:', result1.usage);
      expect(result1.content).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Second turn - adding to conversation
      const params2: CompletionParams = {
        model: 'claude-3-5-haiku-20241022',
        messages: [
          { role: 'system', content: 'You are a helpful math tutor.' },
          { role: 'user', content: 'What is 2+2?' },
          { role: 'assistant', content: result1.content },
          { role: 'user', content: 'And what is 3+3?' },
        ],
        maxTokens: 100,
      };

      const result2 = await llm.generateCompletion(params2);
      console.log('Second turn usage:', result2.usage);
      expect(result2.content).toBeDefined();
    },
    60000,
  );

  testOAuthIf(
    'should successfully call Anthropic API with OAuth authentication',
    async () => {
      const llm = new AnthropicAISDKLLM({
        oauth: {
          type: 'oauth',
          access: oauthAccessToken!,
          refresh: oauthRefreshToken!,
          expires: Date.now() + 3600000, // 1 hour from now
        },
      });

      const params: CompletionParams = {
        model: 'claude-3-5-haiku-20241022',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          { role: 'user', content: 'Say hello in one word.' },
        ],
        maxTokens: 50,
      };

      const result = await llm.generateCompletion(params);

      expect(result.content).toBeDefined();
      expect(typeof result.content).toBe('string');
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.usage).toBeDefined();
      expect(result.usage.prompt_tokens).toBeGreaterThan(0);
      expect(result.usage.completion_tokens).toBeGreaterThan(0);

      console.log('\nOAuth call usage:', result.usage);
      console.log('OAuth call successful!');
    },
    30000,
  );

  testOAuthIf(
    'should work with OAuth and cache control',
    async () => {
      const llm = new AnthropicAISDKLLM({
        oauth: {
          type: 'oauth',
          access: oauthAccessToken!,
          refresh: oauthRefreshToken!,
          expires: Date.now() + 3600000,
        },
      });

      const baseParams: CompletionParams = {
        model: 'claude-3-5-haiku-20241022',
        messages: [
          { role: 'system', content: 'You are a helpful assistant.' },
          {
            role: 'system',
            content:
              'Long context: Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
          },
          { role: 'user', content: 'What is 1+1?' },
        ],
        maxTokens: 100,
      };

      // First call with OAuth
      const result1 = await llm.generateCompletion(baseParams);
      console.log('\nOAuth + Cache first call:', result1.usage);
      expect(result1.content).toBeDefined();

      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Second call should use cache
      const params2: CompletionParams = {
        ...baseParams,
        messages: [...baseParams.messages.slice(0, 2), { role: 'user', content: 'What is 2+2?' }],
      };

      const result2 = await llm.generateCompletion(params2);
      console.log('OAuth + Cache second call:', result2.usage);
      expect(result2.content).toBeDefined();
    },
    60000,
  );
});
