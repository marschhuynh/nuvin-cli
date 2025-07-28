/**
 * Utility functions for provider implementations
 * This file contains pure utility functions with no provider dependencies
 * to avoid circular dependency issues.
 */

/**
 * Extract a value from an object using a dot-notation path
 * Supports array indexing with bracket notation
 * 
 * @param obj - The object to extract from
 * @param path - The path to the value (e.g., "user.name" or "items[0].title")
 * @returns The extracted value or undefined if not found
 */
export function extractValue(obj: any, path: string) {
  return path.split('.').reduce((current, key) => {
    if (current === null || current === undefined) return undefined;
    if (key.includes('[') && key.includes(']')) {
      const [arrayKey, indexStr] = key.split('[');
      const index = parseInt(indexStr.replace(']', ''));
      return current[arrayKey]?.[index];
    }
    return current[key];
  }, obj);
}