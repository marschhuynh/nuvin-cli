// Core tool system
export { ToolRegistry, toolRegistry } from './tool-registry';
export {
  ToolIntegrationService,
  toolIntegrationService,
} from './tool-integration-service';

// Built-in tools
export * from './built-in';

// Types
export * from '@/types/tools';

// Initialize built-in tools
import { registerBuiltInTools } from './built-in';
import { mcpIntegration } from '@/lib/mcp/mcp-integration';

// Auto-register built-in tools when the module is imported
let toolsInitialized = false;
let mcpInitialized = false;

export function initializeTools() {
  if (!toolsInitialized) {
    registerBuiltInTools();
    toolsInitialized = true;
  }
}

export async function initializeMCPTools() {
  if (!mcpInitialized) {
    try {
      await mcpIntegration.initialize();
      mcpInitialized = true;
    } catch (error) {
      console.error('Failed to initialize MCP tools:', error);
    }
  }
}

export function isMCPInitialized(): boolean {
  return mcpInitialized;
}

export function getMCPIntegration() {
  return mcpIntegration;
}

// Auto-initialize on import
initializeTools();
