import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Generate a UUID using the native crypto.randomUUID() API
 * Falls back to a simple random string if crypto.randomUUID is not available
 */
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older browsers/environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Format error messages to be more user-friendly
 * Extracts meaningful information from provider errors and API responses
 */
/**
 * Format error messages to show a simple message followed by error details in a code block
 */
/**
 * Format error messages to show a simple message followed by error details in a code block
 */
export function formatErrorMessage(error: Error | string): string {
  const errorMessage = typeof error === 'string' ? error : error.message;
  
  // Try to parse and format structured error data
  let errorDetails = errorMessage;
  
  // Check if the error message contains JSON data that we can format
  const jsonMatch = errorMessage.match(/(\{.*\})/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      errorDetails = JSON.stringify(parsed, null, 2);
    } catch {
      // If parsing fails, use the original message
      errorDetails = errorMessage;
    }
  }
  
  // Simple error message followed by details in code block
  return `Something went wrong with the request.

\`\`\`json
${errorDetails}
\`\`\``;
}
