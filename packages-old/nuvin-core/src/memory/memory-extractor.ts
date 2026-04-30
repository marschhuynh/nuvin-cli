import type { Message, MessageContent } from '../ports.js';
import type { MemoryType } from './types.js';

export type MemoryCandidate = {
  content: string;
  type: MemoryType;
  tags: string[];
};

const VALID_MEMORY_TYPES = new Set<string>(['semantic', 'episodic', 'procedural']);

const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction assistant. Analyze the conversation below and extract information worth remembering for future interactions.

Extract memories into exactly three categories:
- semantic: General facts, preferences, and knowledge about the user (e.g. "User prefers TypeScript strict mode")
- episodic: Notable events, accomplishments, or past interactions (e.g. "We debugged a memory leak in the auth service together")
- procedural: Workflows, processes, and instructions the user follows (e.g. "Always run pnpm test before committing")

Rules:
- Skip small talk, greetings, and transient details
- Skip information that is only relevant to this specific moment
- Skip duplicates or near-duplicates of the same fact
- Only extract high-signal, reusable information

Respond with ONLY a JSON array in this exact format — no explanation, no markdown, no prose:
[{"content": "...", "type": "semantic|episodic|procedural", "tags": ["tag1", "tag2"]}]

If there is nothing worth remembering, respond with an empty array: []

Conversation to analyze:`;

/**
 * Converts a MessageContent value to a plain string for inclusion in prompts.
 * Handles string, null, and structured parts content.
 */
function contentToString(content: MessageContent): string {
  if (content === null) return '';
  if (typeof content === 'string') return content;
  // Structured parts — concatenate text parts
  return content.parts
    .filter((p): p is Extract<typeof p, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join(' ');
}

/**
 * Extracts a JSON array string from a response that may be wrapped in
 * markdown code blocks (```json ... ``` or ``` ... ```).
 */
function extractJsonArray(response: string): string {
  const trimmed = response.trim();

  // Try to strip markdown code fences first
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Find the first '[' and last ']' as fallback
  const start = trimmed.indexOf('[');
  const end = trimmed.lastIndexOf(']');
  if (start !== -1 && end !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

/**
 * Validates and coerces a raw parsed item into a MemoryCandidate.
 * Returns null if the item is invalid.
 */
function toMemoryCandidate(item: unknown): MemoryCandidate | null {
  if (typeof item !== 'object' || item === null) return null;

  const obj = item as Record<string, unknown>;

  if (typeof obj['content'] !== 'string' || obj['content'].trim() === '') return null;
  if (typeof obj['type'] !== 'string' || !VALID_MEMORY_TYPES.has(obj['type'])) return null;

  const rawTags = obj['tags'];
  const tags: string[] = Array.isArray(rawTags)
    ? rawTags.filter((t): t is string => typeof t === 'string')
    : [];

  return {
    content: obj['content'],
    type: obj['type'] as MemoryType,
    tags,
  };
}

export class MemoryExtractor {
  /**
   * Builds a prompt string instructing an LLM to extract memories from the
   * given conversation messages.
   *
   * Returns an empty string when the messages array is empty so callers can
   * skip the LLM call entirely.
   */
  buildExtractionPrompt(messages: Message[]): string {
    const relevant = messages.filter(m => m.role === 'user' || m.role === 'assistant');
    if (relevant.length === 0) return '';

    const conversation = relevant
      .map(m => `${m.role}: ${contentToString(m.content)}`)
      .join('\n');

    return `${EXTRACTION_SYSTEM_PROMPT}\n\n${conversation}`;
  }

  /**
   * Parses an LLM response into an array of MemoryCandidates.
   *
   * Tolerates JSON wrapped in markdown code fences and silently discards any
   * items that have invalid or missing fields. Never throws.
   */
  parseExtractionResponse(response: string): MemoryCandidate[] {
    try {
      if (typeof response !== 'string') return [];

      const jsonStr = extractJsonArray(response);
      const parsed: unknown = JSON.parse(jsonStr);

      if (!Array.isArray(parsed)) return [];

      const candidates: MemoryCandidate[] = [];
      for (const item of parsed) {
        const candidate = toMemoryCandidate(item);
        if (candidate !== null) {
          candidates.push(candidate);
        }
      }
      return candidates;
    } catch {
      return [];
    }
  }
}
