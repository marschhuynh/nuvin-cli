import { toolRegistry } from '../tool-registry';
import { calculatorTool } from './calculatorTool';
import { timeTool } from './timeTool';
import { randomTool } from './randomTool';

export * from './calculatorTool';
export * from './timeTool';
export * from './randomTool';

/**
 * Register all built-in tools with the tool registry
 */
export function registerBuiltInTools(): void {
  try {
    toolRegistry.registerTool(calculatorTool);
    toolRegistry.registerTool(timeTool);
    toolRegistry.registerTool(randomTool);

    console.log('Built-in tools registered successfully:', {
      calculator: calculatorTool.definition.name,
      time: timeTool.definition.name,
      random: randomTool.definition.name,
    });
  } catch (error) {
    console.error('Failed to register built-in tools:', error);
  }
}

/**
 * Get all built-in tools
 */
export function getBuiltInTools() {
  return [calculatorTool, timeTool, randomTool];
}
