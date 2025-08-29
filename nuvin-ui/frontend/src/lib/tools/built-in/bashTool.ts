import type { Tool } from '@/types/tools';
import { ExecuteCommand as CommandExecutorExecuteCommand } from '@wails/services/commandexecutorservice';
import { isWailsEnvironment } from '@/lib/browser-runtime';

const SERVER_BASE_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:8080';

// Browser-compatible command execution
async function executeCommandBrowser(commandRequest: any) {
  try {
    // Use native fetch directly to avoid Window.fetch issues
    const response = await fetch(`${SERVER_BASE_URL}/execute-command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(commandRequest),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    // Check if this is a network error (server not running)
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new Error(`Cannot connect to server at ${SERVER_BASE_URL}. Make sure nuvin-srv is running on port 8080.`);
    }
    throw new Error(`Command execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export const bashTool: Tool = {
  definition: {
    name: 'bash',
    description:
      'Executes a given bash command in a persistent shell session with optional timeout, ensuring proper handling and security measures.',
    parameters: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The command to execute',
        },
        description: {
          type: 'string',
          description:
            "Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory 'foo'",
        },
        timeout: {
          type: 'number',
          description:
            'Optional timeout in milliseconds (max 600000). If not specified, commands will timeout after 120000ms (2 minutes).',
          minimum: 1000,
          maximum: 600000,
        },
      },
      required: ['command'],
    },
  },

  async execute(parameters) {
    try {
      const { command, description, timeout } = parameters;

      if (!command || typeof command !== 'string') {
        return {
          status: 'error',
          type: 'text',
          result: 'Command parameter is required and must be a string',
        };
      }

      // Convert timeout from milliseconds to seconds for backend
      const timeoutSeconds = timeout ? Math.floor(timeout / 1000) : 120;

      // Validate timeout bounds
      if (timeoutSeconds > 600) {
        return {
          status: 'error',
          type: 'text',
          result: 'Timeout cannot exceed 600 seconds (10 minutes)',
        };
      }

      // Security check: Warn about potentially dangerous commands
      const dangerousCommands = [
        'chmod -R 777',
        'dd if=',
        'mkfs',
        'fdisk',
        '> /dev/',
        'shutdown',
        'reboot',
        'halt',
        'init 0',
        'init 6',
        'kill -9 -1',
        'killall -9',
      ];

      const isDangerous = dangerousCommands.some((dangerous) => command.toLowerCase().includes(dangerous));

      if (isDangerous) {
        return {
          status: 'error',
          type: 'text',
          result: 'Command contains potentially dangerous operations and has been blocked for security reasons',
        };
      }

      // Prepare command request
      const commandRequest = {
        command: command.trim(),
        timeout: timeoutSeconds,
        description: description || `Execute: ${command}`,
      };

      console.log(`Executing bash command: "${command}" (timeout: ${timeoutSeconds}s)`);

      let response;
      if (isWailsEnvironment()) {
        // Execute command via Wails backend
        response = await CommandExecutorExecuteCommand(commandRequest);
      } else {
        // Execute command via HTTP server for browser environment
        response = await executeCommandBrowser(commandRequest);
      }

      // Format response for tool result
      const additionalResult: Record<string, any> = {
        command: command,
        exitCode: response.exitCode,
        duration: response.duration,
        description: description,
      };

      // Add warnings for long-running commands
      if (response.duration > 30000) {
        additionalResult.warning = `Command took ${Math.round(response.duration / 1000)}s to complete`;
      }

      // Add truncation warning if needed
      if (response.truncated) {
        additionalResult.warning = `${additionalResult.warning ? `${additionalResult.warning}. ` : ''}Output was truncated due to size limits`;
      }

      // Check if command failed
      if (!response.success) {
        let errorMessage = response.error || `Command failed with exit code ${response.exitCode}`;

        // Include stderr in error if available
        if (response.stderr) {
          errorMessage += `\nStderr: ${response.stderr}`;
        }

        return {
          status: 'error',
          type: 'text',
          result: errorMessage,
          additionalResult,
        };
      }

      // Format successful output
      let output = '';
      if (response.stdout) {
        output += response.stdout;
      }
      if (response.stderr) {
        if (output) output += '\n';
        output += `[stderr] ${response.stderr}`;
      }

      return {
        status: 'success',
        type: 'text',
        result: output || '(no output)',
        additionalResult,
      };
    } catch (error) {
      return {
        status: 'error',
        type: 'text',
        result: `Bash execution error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  },

  validate(parameters) {
    if (!parameters.command || typeof parameters.command !== 'string') {
      return false;
    }

    if (parameters.command.trim().length === 0) {
      return false;
    }

    if (parameters.timeout !== undefined) {
      if (typeof parameters.timeout !== 'number') {
        return false;
      }
      if (parameters.timeout < 1000 || parameters.timeout > 600000) {
        return false;
      }
    }

    return true;
  },

  category: 'system',
  version: '1.0.0',
  author: 'system',
};
