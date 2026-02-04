/**
 * ACP (Agent Client Protocol) Module
 *
 * This module provides the implementation for ACP server support in Nuvin CLI,
 * allowing editors like Zed and JetBrains IDEs to communicate with the agent
 * using the standardized Agent Client Protocol.
 *
 * @module acp
 */

// =============================================================================
// Type Exports
// =============================================================================

export * from './types.js';

// =============================================================================
// Server Exports
// =============================================================================

export { ACPServer, createACPServer, type ACPServerConfig } from './server.js';

// =============================================================================
// Handler Exports
// =============================================================================

// Note: handler.ts will be created in Task 3
export type { ACPHandler } from './handler.js';
