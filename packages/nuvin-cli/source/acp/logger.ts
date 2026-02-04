/**
 * ACP Logger - File-based logging for ACP server debugging
 *
 * Creates a dedicated logger for ACP operations that writes to a separate
 * log file for easy debugging of editor integrations.
 */

import { FileLogger } from '../utils/file-logger.js';
import * as path from 'node:path';
import * as os from 'node:os';

/**
 * ACP Logger instance configured for debug-level logging.
 * Logs are written to ~/.nuvin/logs/acp.log
 */
export const acpLogger = new FileLogger({
  logDir: path.join(os.homedir(), '.nuvin', 'logs'),
  logFileName: 'acp',
  minLevel: 'debug',
  includeTimestamp: true,
  logToConsole: false, // Never log to console - it would corrupt JSON-RPC
});

/**
 * Log an incoming JSON-RPC request
 */
export function logRequest(method: string, params?: unknown): void {
  acpLogger.debug(`[REQUEST] ${method}`, params);
}

/**
 * Log an outgoing JSON-RPC response
 */
export function logResponse(method: string, result?: unknown): void {
  acpLogger.debug(`[RESPONSE] ${method}`, result);
}

/**
 * Log an outgoing JSON-RPC notification
 */
export function logNotification(method: string, params?: unknown): void {
  acpLogger.debug(`[NOTIFICATION] ${method}`, params);
}

/**
 * Log an error
 */
export function logError(context: string, error: unknown): void {
  acpLogger.error(`[ERROR] ${context}`, error);
}

/**
 * Log session lifecycle events
 */
export function logSession(event: string, sessionId: string, data?: unknown): void {
  acpLogger.info(`[SESSION:${sessionId}] ${event}`, data);
}

/**
 * Log server lifecycle events
 */
export function logServer(event: string, data?: unknown): void {
  acpLogger.info(`[SERVER] ${event}`, data);
}
