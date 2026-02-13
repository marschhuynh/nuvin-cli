/**
 * Centralized formatting utilities for the Nuvin CLI
 * All time, token, cost and display formatting functions in one place
 *
 * @module formatters
 * @description Provides consistent formatting across the CLI for tokens, costs,
 * durations, timestamps, and git information with intelligent caching.
 */

import os from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
import { theme, type Theme } from '@/theme.js';

// ============================================================================
// CONSTANTS
// ============================================================================

/** Token formatting thresholds */
const TOKEN_THRESHOLDS = {
  BILLION: 1_000_000_000,
  MILLION: 1_000_000,
  THOUSAND: 1_000,
} as const;

/** Duration formatting thresholds in milliseconds */
const DURATION_THRESHOLDS = {
  SECOND: 1_000,
  MINUTE: 60_000,
  HOUR: 3_600_000,
} as const;

/** Git branch cache configuration */
const GIT_BRANCH_CACHE_TTL = 5_000; // 5 seconds

// ============================================================================
// TYPES
// ============================================================================

/** Result type for message count badge */
export interface MessageCountBadge {
  text: string;
  color: string;
}

/** Git branch cache entry */
interface GitBranchCacheEntry {
  value: string | null;
  timestamp: number;
}

// ============================================================================
// CACHES
// ============================================================================

const gitBranchCache = new Map<string, GitBranchCacheEntry>();

// ============================================================================
// TOKEN FORMATTING
// ============================================================================

/**
 * Format token counts with appropriate suffixes (B, M, k)
 *
 * @param tokens - The number of tokens to format
 * @returns Formatted string with appropriate suffix
 *
 * @example
 * formatTokens(500)        // "500"
 * formatTokens(1500)       // "1.5k"
 * formatTokens(2500000)    // "2.50M"
 * formatTokens(null)       // "-"
 */
export const formatTokens = (tokens: number | null | undefined): string => {
  if (tokens == null) return '-';
  if (tokens >= TOKEN_THRESHOLDS.BILLION) {
    return `${(tokens / TOKEN_THRESHOLDS.BILLION).toFixed(2)}B`;
  }
  if (tokens >= TOKEN_THRESHOLDS.MILLION) {
    return `${(tokens / TOKEN_THRESHOLDS.MILLION).toFixed(2)}M`;
  }
  if (tokens >= TOKEN_THRESHOLDS.THOUSAND) {
    return `${(tokens / TOKEN_THRESHOLDS.THOUSAND).toFixed(1)}k`;
  }
  return tokens.toString();
};

// ============================================================================
// COST FORMATTING
// ============================================================================

/**
 * Format cost with appropriate decimal precision
 *
 * @param cost - The cost value to format
 * @returns Formatted cost string with appropriate decimal places
 *
 * @example
 * formatCost(0)        // "0.00"
 * formatCost(0.005)    // "0.0050"
 * formatCost(0.5)      // "0.500"
 * formatCost(10)       // "10.00"
 */
export const formatCost = (cost: number): string => {
  if (cost === 0) return '0.00';
  if (cost < 0.01) return cost.toFixed(4);
  if (cost < 1) return cost.toFixed(3);
  return cost.toFixed(2);
};

// ============================================================================
// PATH FORMATTING
// ============================================================================

/**
 * Format directory paths, replacing home directory with ~
 *
 * @param dir - The directory path to format
 * @returns Path with home directory replaced by ~
 *
 * @example
 * formatDirectory('/Users/john/projects')  // "~/projects"
 */
export const formatDirectory = (dir: string): string => {
  const home = os.homedir();
  return dir.replace(home, '~');
};

// ============================================================================
// DURATION FORMATTING
// ============================================================================

/**
 * Format duration in milliseconds to human-readable string
 *
 * @param durationMs - Duration in milliseconds
 * @returns Formatted duration string or null for invalid input
 *
 * @example
 * formatDuration(500)       // "500ms"
 * formatDuration(5000)      // "5.0s"
 * formatDuration(90000)     // "1m 30s"
 * formatDuration(null)      // null
 */
export const formatDuration = (durationMs: number | null | undefined): string | null => {
  if (durationMs == null || !Number.isFinite(durationMs)) return null;

  if (durationMs < DURATION_THRESHOLDS.SECOND) {
    return `${durationMs}ms`;
  }

  if (durationMs < DURATION_THRESHOLDS.MINUTE) {
    return `${(durationMs / DURATION_THRESHOLDS.SECOND).toFixed(1)}s`;
  }

  const minutes = Math.floor(durationMs / DURATION_THRESHOLDS.MINUTE);
  const seconds = ((durationMs % DURATION_THRESHOLDS.MINUTE) / DURATION_THRESHOLDS.SECOND).toFixed(0);
  return `${minutes}m${seconds ? ` ${seconds}s` : ''}`;
};

// ============================================================================
// TIME FORMATTING
// ============================================================================

/**
 * Format timestamp into relative time string
 *
 * @param timestamp - ISO timestamp string
 * @returns Human-readable relative time string
 *
 * @example
 * formatRelativeTime("2024-01-15T10:00:00Z")  // "Just now" | "5m ago" | etc.
 */
export const formatRelativeTime = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  if (diffInMinutes < 5) return 'Just now';
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  if (diffInHours < 24) {
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return diffInHours < 6 ? `${diffInHours}h ago` : `Today ${timeStr}`;
  }

  if (diffInDays === 1) {
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `Yesterday ${timeStr}`;
  }

  if (diffInDays < 7) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    return `${dayName} ${timeStr}`;
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

/**
 * Format time in seconds (for ToolTimer compatibility)
 *
 * @param seconds - Time in seconds
 * @returns Formatted time string
 */
export const formatTimeFromSeconds = (seconds: number): string => {
  return `${seconds.toFixed(0)}s`;
};

// ============================================================================
// USAGE COLOR
// ============================================================================

/**
 * Get usage color based on percentage threshold
 *
 * @param usage - Usage ratio (0-1)
 * @param theme - Current theme object
 * @returns Appropriate color string from theme
 *
 * @example
 * getUsageColor(0.50, theme)  // theme.footer.model (green/normal)
 * getUsageColor(0.90, theme)  // theme.tokens.yellow (warning)
 * getUsageColor(0.98, theme)  // theme.tokens.red (critical)
 */
export const getUsageColor = (usage: number, theme: Theme): string => {
  if (usage >= 0.95) return theme.tokens.red;
  if (usage >= 0.85) return theme.tokens.yellow;
  return theme.footer.model;
};

// ============================================================================
// GIT BRANCH
// ============================================================================

/**
 * Get git branch for a directory (async version)
 * Results are cached for 5 seconds to avoid repeated exec calls
 *
 * @param dir - Directory to check for git branch
 * @returns Branch name or null if not in a git repo
 */
export const getGitBranchAsync = async (dir: string): Promise<string | null> => {
  const cached = gitBranchCache.get(dir);
  if (cached && Date.now() - cached.timestamp < GIT_BRANCH_CACHE_TTL) {
    return cached.value;
  }

  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD', {
      cwd: dir,
      encoding: 'utf8',
      timeout: 3000,
    });
    const result = stdout.trim();
    gitBranchCache.set(dir, { value: result, timestamp: Date.now() });
    return result;
  } catch {
    gitBranchCache.set(dir, { value: null, timestamp: Date.now() });
    return null;
  }
};

/**
 * Sync version for backward compatibility - returns cached value or null
 * Triggers async fetch if cache is stale
 *
 * @param dir - Directory to check for git branch
 * @returns Cached branch name or null
 */
export const getGitBranch = (dir: string): string | null => {
  const cached = gitBranchCache.get(dir);
  if (cached && Date.now() - cached.timestamp < GIT_BRANCH_CACHE_TTL) {
    return cached.value;
  }
  // Trigger async fetch for next call
  getGitBranchAsync(dir);
  return cached?.value ?? null;
};

// ============================================================================
// MESSAGE COUNT BADGE
// ============================================================================

/**
 * Format message count with badge text and color
 *
 * @param count - Number of messages
 * @returns Badge with text and appropriate color
 *
 * @example
 * getMessageCountBadge(1)   // { text: "1 msg", color: gray }
 * getMessageCountBadge(5)   // { text: "5 msgs", color: cyan }
 * getMessageCountBadge(25)  // { text: "25 msgs", color: green }
 * getMessageCountBadge(100) // { text: "100 msgs", color: magenta }
 */
export const getMessageCountBadge = (count: number): MessageCountBadge => {
  if (count === 1) return { text: '1 msg', color: theme.tokens.gray };
  if (count < 10) return { text: `${count} msgs`, color: theme.tokens.cyan };
  if (count < 50) return { text: `${count} msgs`, color: theme.tokens.green };
  return { text: `${count} msgs`, color: theme.tokens.magenta };
};
