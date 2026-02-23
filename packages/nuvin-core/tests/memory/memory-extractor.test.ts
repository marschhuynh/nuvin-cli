import { describe, it, expect } from 'vitest';
import { MemoryExtractor } from '../../src/memory/memory-extractor.js';
import type { MemoryCandidate } from '../../src/memory/memory-extractor.js';
import type { Message } from '../../src/ports.js';

function makeMessage(role: 'user' | 'assistant' | 'tool', content: string, id = 'msg-1'): Message {
  return { id, role, content, timestamp: '2024-01-01T00:00:00Z' };
}

describe('MemoryExtractor', () => {
  const extractor = new MemoryExtractor();

  describe('buildExtractionPrompt', () => {
    it('returns empty string for empty messages array', () => {
      expect(extractor.buildExtractionPrompt([])).toBe('');
    });

    it('builds a prompt containing conversation text', () => {
      const messages: Message[] = [
        makeMessage('user', 'I prefer TypeScript with strict mode', 'msg-1'),
        makeMessage('assistant', 'Got it, I will use strict TypeScript for you.', 'msg-2'),
      ];

      const prompt = extractor.buildExtractionPrompt(messages);

      expect(prompt).toContain('I prefer TypeScript with strict mode');
      expect(prompt).toContain('Got it, I will use strict TypeScript for you.');
      expect(prompt).toContain('user:');
      expect(prompt).toContain('assistant:');
    });

    it('includes all three memory type names in the prompt', () => {
      const messages: Message[] = [
        makeMessage('user', 'Hello', 'msg-1'),
      ];

      const prompt = extractor.buildExtractionPrompt(messages);

      expect(prompt).toContain('semantic');
      expect(prompt).toContain('episodic');
      expect(prompt).toContain('procedural');
    });

    it('filters out tool role messages', () => {
      const messages: Message[] = [
        makeMessage('user', 'Run the tests for me', 'msg-1'),
        makeMessage('tool', 'stdout: all tests passed', 'msg-2'),
        makeMessage('assistant', 'Tests are passing!', 'msg-3'),
      ];

      const prompt = extractor.buildExtractionPrompt(messages);

      expect(prompt).toContain('Run the tests for me');
      expect(prompt).toContain('Tests are passing!');
      expect(prompt).not.toContain('stdout: all tests passed');
    });

    it('handles messages with structured (non-string) content', () => {
      const messages: Message[] = [
        {
          id: 'msg-1',
          role: 'user',
          content: { type: 'parts', parts: [{ type: 'text', text: 'Structured content message' }] },
          timestamp: '2024-01-01T00:00:00Z',
        },
        makeMessage('assistant', 'Understood.', 'msg-2'),
      ];

      const prompt = extractor.buildExtractionPrompt(messages);

      // Should not throw and should produce a non-empty prompt
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('assistant:');
    });
  });

  describe('parseExtractionResponse', () => {
    it('parses a valid JSON array into MemoryCandidates', () => {
      const response = JSON.stringify([
        { content: 'User prefers TypeScript', type: 'semantic', tags: ['typescript', 'preferences'] },
        { content: 'Debugged a segfault together', type: 'episodic', tags: ['debugging'] },
        { content: 'Always run pnpm test before committing', type: 'procedural', tags: ['workflow'] },
      ]);

      const candidates = extractor.parseExtractionResponse(response);

      expect(candidates).toHaveLength(3);
      expect(candidates[0]).toEqual<MemoryCandidate>({
        content: 'User prefers TypeScript',
        type: 'semantic',
        tags: ['typescript', 'preferences'],
      });
      expect(candidates[1].type).toBe('episodic');
      expect(candidates[2].type).toBe('procedural');
    });

    it('returns empty array for non-JSON input', () => {
      expect(extractor.parseExtractionResponse('not json at all')).toEqual([]);
      expect(extractor.parseExtractionResponse('')).toEqual([]);
      expect(extractor.parseExtractionResponse('   ')).toEqual([]);
    });

    it('handles JSON wrapped in markdown code blocks', () => {
      const response = `Here are the extracted memories:

\`\`\`json
[
  { "content": "User likes dark mode", "type": "semantic", "tags": ["ui"] }
]
\`\`\``;

      const candidates = extractor.parseExtractionResponse(response);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].content).toBe('User likes dark mode');
      expect(candidates[0].type).toBe('semantic');
      expect(candidates[0].tags).toEqual(['ui']);
    });

    it('handles JSON wrapped in plain code blocks (no language tag)', () => {
      const response = `\`\`\`
[{ "content": "User is a developer", "type": "semantic", "tags": [] }]
\`\`\``;

      const candidates = extractor.parseExtractionResponse(response);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].content).toBe('User is a developer');
    });

    it('filters out items with invalid type values', () => {
      const response = JSON.stringify([
        { content: 'Valid entry', type: 'semantic', tags: [] },
        { content: 'Bad type', type: 'unknown_type', tags: [] },
        { content: 'Also bad', type: 123, tags: [] },
        { content: 'Good procedural', type: 'procedural', tags: ['x'] },
      ]);

      const candidates = extractor.parseExtractionResponse(response);

      expect(candidates).toHaveLength(2);
      expect(candidates[0].type).toBe('semantic');
      expect(candidates[1].type).toBe('procedural');
    });

    it('filters out items missing content string', () => {
      const response = JSON.stringify([
        { content: 'Good', type: 'semantic', tags: [] },
        { content: 42, type: 'semantic', tags: [] },
        { type: 'episodic', tags: [] },
      ]);

      const candidates = extractor.parseExtractionResponse(response);

      expect(candidates).toHaveLength(1);
      expect(candidates[0].content).toBe('Good');
    });

    it('defaults to empty tags array when tags field is absent or invalid', () => {
      const response = JSON.stringify([
        { content: 'No tags field', type: 'semantic' },
        { content: 'Null tags', type: 'episodic', tags: null },
      ]);

      const candidates = extractor.parseExtractionResponse(response);

      expect(candidates).toHaveLength(2);
      expect(candidates[0].tags).toEqual([]);
      expect(candidates[1].tags).toEqual([]);
    });

    it('returns empty array when response is a JSON object (not array)', () => {
      const response = JSON.stringify({ content: 'Not an array', type: 'semantic' });
      expect(extractor.parseExtractionResponse(response)).toEqual([]);
    });

    it('never throws — returns empty array on any unexpected input', () => {
      const inputs = [
        null as unknown as string,
        undefined as unknown as string,
        '{ broken json',
        '[}',
      ];

      for (const input of inputs) {
        expect(() => extractor.parseExtractionResponse(input)).not.toThrow();
        expect(extractor.parseExtractionResponse(input)).toEqual([]);
      }
    });
  });
});
