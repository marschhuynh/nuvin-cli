import { useState } from 'react';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Message } from '@nuvin/nuvin-core';
import type { MessageLine, MessageMetadata } from '@/adapters/index.js';
import { getDefaultLogger } from '@/utils/file-logger.js';
import type { SessionInfo } from '@/types.js';
import { ConfigManager } from '@/config/manager.js';
import { DEFAULT_PROFILE } from '@/config/profile-types.js';

function sessionsDir(profile?: string): string {
  const configManager = ConfigManager.getInstance();
  const profileManager = configManager.getProfileManager();

  if (!profileManager) {
    return path.join(os.homedir(), '.nuvin', 'sessions');
  }

  const activeProfile = profile ?? configManager.getCurrentProfile();
  return profileManager.getProfileSessionsDir(activeProfile);
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    const data = await fsp.readFile(file, 'utf-8');
    if (!data || !data.trim()) {
      return null;
    }
    const parsed = JSON.parse(data);
    if (parsed === null || parsed === undefined) {
      return null;
    }
    return parsed as T;
  } catch (err: unknown) {
    const nodeErr = err as NodeJS.ErrnoException;
    if (nodeErr?.code === 'ENOENT') return null;
    throw err;
  }
}

// Cache for scanAvailableSessions
type SessionData = SessionInfo[];
type CacheKey = string;

const sessionCache = new Map<
  CacheKey,
  {
    timestamp: number;
    data: SessionData;
  }
>();

const CACHE_TTL = 10000; // 10 seconds

// Promise for deduplication
const scanPromises = new Map<CacheKey, Promise<SessionData>>();

const logger = getDefaultLogger();

function getCacheKey(limit?: number, offset?: number, profile?: string): CacheKey {
  return `${profile ?? DEFAULT_PROFILE}:scan:${limit ?? 'all'}:${offset ?? 0}`;
}

// Export standalone functions for use in commands
export const scanAvailableSessions = async (limit?: number, offset?: number, profile?: string): Promise<SessionInfo[]> => {
  const cacheKey = getCacheKey(limit, offset, profile);

  // Check cache
  const cached = sessionCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.info('Cache hit:', cacheKey);
    return cached.data;
  }

  // Check active promise
  const existingPromise = scanPromises.get(cacheKey);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async () => {
    try {
      const dir = sessionsDir(profile);
      if (!fs.existsSync(dir)) return [];

      const entries = await fsp.readdir(dir, { withFileTypes: true });
      const sessionDirs = entries.filter((d) => d.isDirectory()).map((d) => d.name);

      // Sort by timestamp descending (newest first)
      sessionDirs.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));

      const sessions: SessionData = [];
      // NOTE: Offset-based pagination assumes the sessions directory doesn't change
      // between page fetches. Since sessions are append-only and the 10s TTL is short,
      // this is acceptable. The TTL cache prevents redundant reads within one open.
      let skipped = 0;
      const skip = offset ?? 0;

      for (const sessionIdStr of sessionDirs) {
        // Stop if we have enough sessions
        if (limit && sessions.length >= limit) {
          break;
        }

        const historyFile = path.join(dir, sessionIdStr, 'history.cli.json');
        try {
          const historyData = await readJson<Record<string, unknown>>(historyFile);
          if (!historyData) {
            continue;
          }

          const cliMessages = (historyData?.default ?? historyData?.cli ?? []) as Message[];
          if (cliMessages.length === 0) {
            continue;
          }

          // Skip first `skip` qualifying sessions for offset pagination
          if (skipped < skip) {
            skipped++;
            continue;
          }

          let lastMessage = 'No messages';
          for (let i = cliMessages.length - 1; i >= 0; i--) {
            const msg = cliMessages[i];
            if (!msg || typeof msg !== 'object') continue;
            const msgObj = msg as { role?: string; content?: unknown };
            if (msgObj.role === 'user') {
              const content = msgObj.content;
              const text = typeof content === 'string' ? content : '';
              lastMessage = text;
              break;
            }
          }

          const metadataKey = '__metadata__default';
          const metadataArray = historyData?.[metadataKey] as unknown[];
          const metadata = metadataArray && metadataArray.length > 0 ? metadataArray[0] : null;
          const topic =
            metadata && typeof metadata === 'object' && 'topic' in metadata
              ? (metadata as { topic?: string }).topic
              : undefined;

          const timestamp = new Date(parseInt(sessionIdStr, 10)).toLocaleString();
          sessions.push({
            sessionId: sessionIdStr,
            timestamp,
            lastMessage,
            messageCount: cliMessages.length,
            topic,
          });
        } catch (err) {
          logger.debug(`Failed to read session ${sessionIdStr}:`, err);
        }
      }
      // Update cache
      sessionCache.set(cacheKey, {
        timestamp: Date.now(),
        data: sessions,
      });

      return sessions;
    } finally {
      scanPromises.delete(cacheKey);
    }
  })();

  scanPromises.set(cacheKey, promise);
  return promise;
};

const searchCache = new Map<CacheKey, { timestamp: number; data: SessionData }>();
const searchPromises = new Map<CacheKey, Promise<SessionData>>();

export const searchSessions = async (query: string, profile?: string): Promise<SessionInfo[]> => {
  const q = query.toLowerCase().trim();
  if (!q) return [];

  const cacheKey = `${profile ?? DEFAULT_PROFILE}:search:${q}`;

  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const existing = searchPromises.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const dir = sessionsDir(profile);
      if (!fs.existsSync(dir)) return [];

      const entries = await fsp.readdir(dir, { withFileTypes: true });
      const sessionDirs = entries
        .filter((d) => d.isDirectory())
        .map((d) => d.name)
        .sort((a, b) => parseInt(b, 10) - parseInt(a, 10));

      const results: SessionData = [];

      for (const sessionIdStr of sessionDirs) {
        const historyFile = path.join(dir, sessionIdStr, 'history.cli.json');
        try {
          const historyData = await readJson<Record<string, unknown>>(historyFile);
          if (!historyData) continue;

          const cliMessages = (historyData?.default ?? historyData?.cli ?? []) as Message[];
          if (cliMessages.length === 0) continue;

          let lastMessage = 'No messages';
          for (let i = cliMessages.length - 1; i >= 0; i--) {
            const msg = cliMessages[i] as { role?: string; content?: unknown };
            if (msg?.role === 'user') {
              lastMessage = typeof msg.content === 'string' ? msg.content : '';
              break;
            }
          }

          const metadataKey = '__metadata__default';
          const metadataArray = historyData?.[metadataKey] as unknown[];
          const metadata = metadataArray?.[0] ?? null;
          const topic =
            metadata && typeof metadata === 'object' && 'topic' in metadata
              ? (metadata as { topic?: string }).topic
              : undefined;

          const haystack = `${topic ?? ''} ${lastMessage}`.toLowerCase();
          if (!haystack.includes(q)) continue;

          results.push({
            sessionId: sessionIdStr,
            timestamp: new Date(parseInt(sessionIdStr, 10)).toLocaleString(),
            lastMessage,
            messageCount: cliMessages.length,
            topic,
          });
        } catch (err) {
          logger.debug(`Failed to read session ${sessionIdStr}:`, err);
        }
      }
      searchCache.set(cacheKey, { timestamp: Date.now(), data: results });
      return results;
    } finally {
      searchPromises.delete(cacheKey);
    }
  })();

  searchPromises.set(cacheKey, promise);
  return promise;
};

export type LoadResult =
  | { kind: 'messages'; lines: MessageLine[]; metadata: MessageMetadata | null; cliMessages: Message[]; count: number }
  | { kind: 'empty'; reason: 'no_messages' | 'not_found' };

export const createNewSession = async (
  customId?: string,
  profile?: string,
): Promise<{ sessionId: string; sessionDir: string }> => {
  const id = customId ?? String(Date.now());
  const dir = sessionsDir(profile);
  const sessionDir = path.join(dir, id);
  return { sessionId: id, sessionDir };
};

export const loadHistoryFromFile = async (historyFile: string): Promise<LoadResult> => {
  try {
    const historyData = await readJson<Record<string, unknown>>(historyFile);
    if (!historyData) {
      return { kind: 'empty', reason: 'not_found' };
    }

    const cliMessages = (historyData?.default ?? historyData?.cli ?? []) as Message[];
    if (cliMessages.length === 0) return { kind: 'empty', reason: 'no_messages' };

    const { processMessageToUILines } = await import('../utils/messageProcessor.js');
    const uiMessages: MessageLine[] = [];

    for (const msg of cliMessages) {
      uiMessages.push(...processMessageToUILines(msg));
    }

    let metadata: MessageMetadata | null = null;
    for (let i = cliMessages.length - 1; i >= 0; i--) {
      const msg = cliMessages[i];
      if (msg.role === 'assistant') {
        metadata = {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        };
        break;
      }
    }

    return { kind: 'messages', lines: uiMessages, metadata, cliMessages, count: cliMessages.length };
  } catch (_err) {
    return { kind: 'empty', reason: 'not_found' };
  }
};

export const loadSessionHistory = async (selectedSessionId: string, profile?: string): Promise<LoadResult> => {
  const dir = sessionsDir(profile);
  const historyFile = path.join(dir, selectedSessionId, 'history.cli.json');
  return loadHistoryFromFile(historyFile);
};

export const getSessionDir = (sessionId: string, profile?: string): string => {
  return path.join(sessionsDir(profile), sessionId);
};

export const useSessionManagement = () => {
  const [availableSessions, setAvailableSessions] = useState<SessionInfo[]>([]);

  return {
    availableSessions,
    setAvailableSessions,
    scanAvailableSessions,
    loadSessionHistory,
    loadHistoryFromFile,
    createNewSession,
  };
};
