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

export {
  NuvinACPHandler,
  ACPError,
  ACPErrorCode,
  type ACPHandler,
} from './handler.js';
