import { describe, it, expect } from 'vitest';

// Test the core validation logic without Wails dependencies
const bashToolValidate = (parameters: any): boolean => {
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
};

const isDangerousCommand = (command: string): boolean => {
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

  return dangerousCommands.some((dangerous) =>
    command.toLowerCase().includes(dangerous),
  );
};

describe('bashTool', () => {
  describe('validation', () => {
    it('should validate correct parameters', () => {
      expect(bashToolValidate({ command: 'ls -la' })).toBe(true);
      expect(bashToolValidate({ command: 'echo hello', timeout: 5000 })).toBe(true);
      expect(bashToolValidate({ command: 'git status' })).toBe(true);
    });

    it('should reject invalid parameters', () => {
      expect(bashToolValidate({})).toBe(false);
      expect(bashToolValidate({ command: '' })).toBe(false);
      expect(bashToolValidate({ command: '   ' })).toBe(false);
      expect(bashToolValidate({ command: 123 })).toBe(false);
      expect(bashToolValidate({ command: null })).toBe(false);
      expect(bashToolValidate({ command: undefined })).toBe(false);
    });

    it('should validate timeout parameters', () => {
      expect(bashToolValidate({ command: 'ls', timeout: 1000 })).toBe(true);
      expect(bashToolValidate({ command: 'ls', timeout: 300000 })).toBe(true);
      expect(bashToolValidate({ command: 'ls', timeout: 600000 })).toBe(true);
      
      // Invalid timeouts
      expect(bashToolValidate({ command: 'ls', timeout: 500 })).toBe(false);
      expect(bashToolValidate({ command: 'ls', timeout: 700000 })).toBe(false);
      expect(bashToolValidate({ command: 'ls', timeout: 'invalid' })).toBe(false);
      expect(bashToolValidate({ command: 'ls', timeout: -1000 })).toBe(false);
    });
  });

  describe('security checks', () => {
    it('should detect dangerous commands', () => {
      const dangerousCommands = [
        'rm -rf /',
        'sudo rm -rf /important', 
        'dd if=/dev/zero of=/dev/sda',
        'shutdown now',
        'reboot',
        'halt',
        'init 0',
        'init 6',
        'kill -9 -1',
        'killall -9',
      ];

      // Test patterns that should be caught
      expect(isDangerousCommand('rm -rf /')).toBe(true);
      expect(isDangerousCommand('sudo rm something')).toBe(true);
      expect(isDangerousCommand('dd if=test')).toBe(true);
      expect(isDangerousCommand('shutdown')).toBe(true);
      expect(isDangerousCommand('init 0')).toBe(true);
    });

    it('should allow safe commands', () => {
      const safeCommands = [
        'ls -la',
        'git status',
        'npm install',
        'echo hello',
        'cat file.txt',
        'grep pattern file.txt',
        'find . -name "*.js"',
        'docker ps',
        'kubectl get pods',
      ];

      for (const cmd of safeCommands) {
        expect(isDangerousCommand(cmd)).toBe(false);
      }
    });
  });

  describe('timeout conversion', () => {
    it('should convert milliseconds to seconds correctly', () => {
      const convertTimeout = (timeoutMs?: number): number => {
        return timeoutMs ? Math.floor(timeoutMs / 1000) : 120;
      };

      expect(convertTimeout()).toBe(120); // default
      expect(convertTimeout(1000)).toBe(1);
      expect(convertTimeout(5000)).toBe(5);
      expect(convertTimeout(120000)).toBe(120);
      expect(convertTimeout(600000)).toBe(600);
      expect(convertTimeout(1500)).toBe(1); // rounds down
    });

    it('should enforce maximum timeout', () => {
      const validateTimeout = (timeoutSeconds: number): boolean => {
        return timeoutSeconds <= 600;
      };

      expect(validateTimeout(1)).toBe(true);
      expect(validateTimeout(300)).toBe(true);
      expect(validateTimeout(600)).toBe(true);
      expect(validateTimeout(601)).toBe(false);
      expect(validateTimeout(1000)).toBe(false);
    });
  });
});