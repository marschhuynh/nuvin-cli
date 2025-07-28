import { toolRegistry } from '../tool-registry';
import { calculatorTool } from './calculatorTool';
import { timeTool } from './timeTool';
import { randomTool } from './randomTool';
import { bashTool } from './bashTool';
import { todoWriteTool } from './todoWriteTool';
import { todoReadTool } from './todoReadTool';

export * from './calculatorTool';
export * from './timeTool';
export * from './randomTool';
export * from './bashTool';
export * from './todoWriteTool';
export * from './todoReadTool';

/**
 * Register all built-in tools with the tool registry
 */
export function registerBuiltInTools(): void {
  try {
    toolRegistry.registerTool(calculatorTool);
    toolRegistry.registerTool(timeTool);
    toolRegistry.registerTool(randomTool);
    toolRegistry.registerTool(bashTool);
    toolRegistry.registerTool(todoWriteTool);
    toolRegistry.registerTool(todoReadTool);

    console.log('Built-in tools registered successfully:', {
      calculator: calculatorTool.definition.name,
      time: timeTool.definition.name,
      random: randomTool.definition.name,
      bash: bashTool.definition.name,
      todoWrite: todoWriteTool.definition.name,
      todoRead: todoReadTool.definition.name,
    });
  } catch (error) {
    console.error('Failed to register built-in tools:', error);
  }
}

/**
 * Get all built-in tools
 */
export function getBuiltInTools() {
  return [calculatorTool, timeTool, randomTool, bashTool, todoWriteTool, todoReadTool];
}
