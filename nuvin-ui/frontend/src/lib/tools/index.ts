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

// Auto-register built-in tools when the module is imported
let toolsInitialized = false;

export function initializeTools() {
  if (!toolsInitialized) {
    registerBuiltInTools();
    toolsInitialized = true;
  }
}

// Auto-initialize on import
initializeTools();
