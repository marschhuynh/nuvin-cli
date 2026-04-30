import { describe, it, expect, vi } from 'vitest';
import { GithubAuthTransport } from '../transports/github-transport';
import type { FetchTransport } from '../transports';

// Mock the FetchTransport
const mockFetch = vi.fn();
const mockInnerTransport = {
  post: mockFetch,
  get: mockFetch,
} as unknown as FetchTransport;

describe('GithubAuthTransport', () => {
  it('should add X-Initiator header as "user" when last message is from user', async () => {
    const transport = new GithubAuthTransport(mockInnerTransport, {
      apiKey: 'test-api-key',
    });

    const body = {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello, how are you?' },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'Hello!' } }] }),
      text: () => Promise.resolve(''),
      status: 200,
    });

    await transport.post('https://api.individual.githubcopilot.com/chat/completions', body);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.individual.githubcopilot.com/chat/completions',
      body,
      expect.objectContaining({
        'X-Initiator': 'user',
        'X-Request-Id': expect.any(String),
      }),
      undefined,
    );
  });

  it('should add X-Initiator header as "agent" when last message is from assistant', async () => {
    const transport = new GithubAuthTransport(mockInnerTransport, {
      apiKey: 'test-api-key',
    });

    const body = {
      model: 'gpt-4',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hello! How can I help?' },
        { role: 'tool', content: 'Tool result' },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'Response' } }] }),
      text: () => Promise.resolve(''),
      status: 200,
    });

    await transport.post('https://api.individual.githubcopilot.com/chat/completions', body);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.individual.githubcopilot.com/chat/completions',
      body,
      expect.objectContaining({
        'X-Initiator': 'agent',
      }),
      undefined,
    );
  });

  it('should default to "agent" when no messages are present', async () => {
    const transport = new GithubAuthTransport(mockInnerTransport, {
      apiKey: 'test-api-key',
    });

    const body = { model: 'gpt-4' };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'Response' } }] }),
      text: () => Promise.resolve(''),
      status: 200,
    });

    await transport.post('https://api.individual.githubcopilot.com/chat/completions', body);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.individual.githubcopilot.com/chat/completions',
      body,
      expect.objectContaining({
        'X-Initiator': 'agent',
      }),
      undefined,
    );
  });

  it('should add GitHub Copilot headers for all URLs', async () => {
    const transport = new GithubAuthTransport(mockInnerTransport, {
      apiKey: 'test-api-key',
    });

    const body = { model: 'gpt-4' };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ token: 'new-token' }),
      text: () => Promise.resolve(''),
      status: 200,
    });

    await transport.post('https://api.github.com/some/endpoint', body);

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.github.com/some/endpoint',
      body,
      expect.objectContaining({
        'X-Initiator': 'agent',
        'X-Request-Id': expect.any(String),
        'editor-version': 'vscode/1.104.2',
        'editor-plugin-version': 'copilot-chat/0.31.3',
      }),
      undefined,
    );
  });
});
