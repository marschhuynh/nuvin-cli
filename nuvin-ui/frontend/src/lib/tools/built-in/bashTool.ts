import { Tool } from '@/types/tools';
import * as App from '../../../../wailsjs/go/main/App';

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
            'Clear, concise description of what this command does in 5-10 words. Examples:\nInput: ls\nOutput: Lists files in current directory\n\nInput: git status\nOutput: Shows working tree status\n\nInput: npm install\nOutput: Installs package dependencies\n\nInput: mkdir foo\nOutput: Creates directory \'foo\'',
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
          success: false,
          error: 'Command parameter is required and must be a string',
        };
      }

      // Convert timeout from milliseconds to seconds for backend
      const timeoutSeconds = timeout ? Math.floor(timeout / 1000) : 120;

      // Validate timeout bounds
      if (timeoutSeconds > 600) {
        return {
          success: false,
          error: 'Timeout cannot exceed 600 seconds (10 minutes)',
        };
      }

      // Security check: Warn about potentially dangerous commands
      const dangerousCommands = [
        'rm -rf',
        'sudo rm',
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

      const isDangerous = dangerousCommands.some((dangerous) =>
        command.toLowerCase().includes(dangerous),
      );

      if (isDangerous) {
        return {
          success: false,
          error:
            'Command contains potentially dangerous operations and has been blocked for security reasons',
        };
      }

      // Prepare command request
      const commandRequest = {
        command: command.trim(),
        timeout: timeoutSeconds,
        description: description || `Execute: ${command}`,
      };

      console.log(
        `Executing bash command: "${command}" (timeout: ${timeoutSeconds}s)`,
      );

      // Execute command via Wails backend
      const response = await App.ExecuteCommand(commandRequest);

      // Format response for tool result
      const result = {
        success: response.success,
        data: {
          command: command,
          exitCode: response.exitCode,
          stdout: response.stdout || '',
          stderr: response.stderr || '',
          duration: response.duration,
          description: description,
        },
      } as any;

      // Add error information if command failed
      if (!response.success) {
        result.error = response.error || `Command failed with exit code ${response.exitCode}`;
        
        // Include stderr in error if available
        if (response.stderr) {
          result.error += `\nStderr: ${response.stderr}`;
        }
      }

      // Add warnings for long-running commands
      if (response.duration > 30000) {
        result.data.warning = `Command took ${Math.round(response.duration / 1000)}s to complete`;
      }

      // Add truncation warning if needed
      if (response.truncated) {
        result.data.warning = (result.data.warning ? result.data.warning + '. ' : '') + 
          'Output was truncated due to size limits';
      }

      return result;
    } catch (error) {
      return {
        success: false,
        error: `Bash execution error: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`,
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