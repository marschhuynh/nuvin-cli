import { useState } from 'react';
import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Message } from '@nuvin/nuvin-core';
import type { MessageLine, MessageMetadata } from '@/adapters/index.js';
import { getDefaultLogger } from '@/utils/file-logger.js';
import type { SessionInfo } from '@/types.js';

function sessionsDir() {
  return path.join(os.homedir(), '.nuvin-cli', 'sessions');
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

const sessionCache = new Map<
  number | undefined,
  {
    timestamp: number;
    data: SessionData;
  }
>();

const CACHE_TTL = 10000; // 10 seconds

// Promise for deduplication
const scanPromises = new Map<number | undefined, Promise<SessionData>>();

const logger = getDefaultLogger();

// Export standalone functions for use in commands
export const scanAvailableSessions = async (limit?: number): Promise<
  SessionInfo[]
> => {
  // Check cache

  logger.info('scanAvailableSessions with limit:', limit);

  const cached = sessionCache.get(limit);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.info('Cache hit:', limit);
    return cached.data;
  }

  // Check active promise
  const existingPromise = scanPromises.get(limit);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = (async () => {
    try {
      const dir = sessionsDir();
      if (!fs.existsSync(dir)) return [];

      const entries = await fsp.readdir(dir, { withFileTypes: true });
      const sessionDirs = entries.filter((d) => d.isDirectory()).map((d) => d.name);

      // Sort by timestamp descending (newest first)
      sessionDirs.sort((a, b) => parseInt(b, 10) - parseInt(a, 10));

      const sessions: SessionData = [];

      for (const sessionIdStr of sessionDirs) {
        // Stop if we have enough sessions
        if (limit && sessions.length >= limit) {
          break;
        }

        const historyFile = path.join(dir, sessionIdStr, 'history.json');
        try {
          const historyData = await readJson<Record<string, unknown>>(historyFile);
          if (!historyData) {
            continue;
          }

          const cliMessages = (historyData?.cli ?? []) as Message[];
          if (cliMessages.length === 0) {
            continue;
          }

          let lastMessage = 'No messages';
          for (let i = cliMessages.length - 1; i >= 0; i--) {
            const msg = cliMessages[i];
            if (!msg || typeof msg !== 'object') continue;
            const msgObj = msg as { role?: string; content?: unknown };
            if (msgObj.role === 'user' || msgObj.role === 'assistant') {
              const content = msgObj.content;
              const text = typeof content === 'string' ? content : '';
              lastMessage = text;
              break;
            }
          }

          const metadataKey = '__metadata__cli';
          const metadataArray = historyData?.[metadataKey] as unknown[];
          const metadata = metadataArray && metadataArray.length > 0 ? metadataArray[0] : null;
          const topic = metadata && typeof metadata === 'object' && 'topic' in metadata
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
        } catch (_err) {
        }
      }

      // Update cache
      sessionCache.set(limit, {
        timestamp: Date.now(),
        data: sessions,
      });

      return sessions;
    } finally {
      scanPromises.delete(limit);
    }
  })();

  scanPromises.set(limit, promise);
  return promise;
};

export type LoadResult =
  | { kind: 'messages'; lines: MessageLine[]; metadata: MessageMetadata | null; cliMessages: Message[]; count: number }
  | { kind: 'empty'; reason: 'no_messages' | 'not_found' };

export const createNewSession = async (customId?: string): Promise<{ sessionId: string; sessionDir: string }> => {
  const id = customId ?? String(Date.now());
  const dir = sessionsDir();
  const sessionDir = path.join(dir, id);
  try {
    await fsp.mkdir(sessionDir, { recursive: true });
  } catch { }
  return { sessionId: id, sessionDir };
};

export const loadHistoryFromFile = async (historyFile: string): Promise<LoadResult> => {
  try {
    const historyData = await readJson<{ cli?: Message[] }>(historyFile);
    if (!historyData) {
      return { kind: 'empty', reason: 'not_found' };
    }

    const cliMessages = historyData.cli || [];
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

export const loadSessionHistory = async (selectedSessionId: string): Promise<LoadResult> => {
  const dir = sessionsDir();
  const historyFile = path.join(dir, selectedSessionId, 'history.json');
  return loadHistoryFromFile(historyFile);
};

export const useSessionManagement = () => {
  const [availableSessions, setAvailableSessions] = useState<
    SessionInfo[]
  >([]);

  return {
    availableSessions,
    setAvailableSessions,
    scanAvailableSessions,
    loadSessionHistory,
    loadHistoryFromFile,
    createNewSession,
  };
};
