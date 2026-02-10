import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { IncomingMessage } from 'node:http';

// Mock https module
vi.mock('node:https', () => ({
  default: {
    request: vi.fn(),
  },
}));

// Mock version module
vi.mock('../source/utils/version.js', () => ({
  getVersion: vi.fn(() => '1.0.0-rc.1'),
}));

import https from 'node:https';
import { UpdateChecker } from '../source/services/UpdateChecker.js';
import { getVersion } from '../source/utils/version.js';

const mockRequest = https.request as ReturnType<typeof vi.fn>;
const mockGetVersion = getVersion as ReturnType<typeof vi.fn>;

describe('UpdateChecker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('RC to Stable version detection', () => {
    it('should detect update when current is RC and latest is stable (same base version)', async () => {
      mockGetVersion.mockReturnValue('1.0.0-rc.1');

      mockRequest.mockImplementation((_options, callback) => {
        const res = {
          statusCode: 200,
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              handler(Buffer.from('{"version":"1.0.0"}'));
            }
            if (event === 'end') {
              handler();
            }
          }),
        } as unknown as IncomingMessage;
        callback(res as IncomingMessage);
        return {
          on: vi.fn(),
          end: vi.fn(),
        } as any;
      });

      const result = await UpdateChecker.checkForUpdate();

      expect(result.hasUpdate).toBe(true);
      expect(result.current).toBe('1.0.0-rc.1');
      expect(result.latest).toBe('1.0.0');
    });

    it('should detect update when current is RC and latest is newer stable', async () => {
      mockGetVersion.mockReturnValue('1.0.0-rc.1');

      mockRequest.mockImplementation((_options, callback) => {
        const res = {
          statusCode: 200,
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              handler(Buffer.from('{"version":"1.0.1"}'));
            }
            if (event === 'end') {
              handler();
            }
          }),
        } as unknown as IncomingMessage;
        callback(res as IncomingMessage);
        return {
          on: vi.fn(),
          end: vi.fn(),
        } as any;
      });

      const result = await UpdateChecker.checkForUpdate();

      expect(result.hasUpdate).toBe(true);
      expect(result.current).toBe('1.0.0-rc.1');
      expect(result.latest).toBe('1.0.1');
    });

    it('should NOT show update when current is stable and latest is RC', async () => {
      mockGetVersion.mockReturnValue('1.0.0');

      mockRequest.mockImplementation((_options, callback) => {
        const res = {
          statusCode: 200,
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              handler(Buffer.from('{"version":"1.0.1-rc.1"}'));
            }
            if (event === 'end') {
              handler();
            }
          }),
        } as unknown as IncomingMessage;
        callback(res as IncomingMessage);
        return {
          on: vi.fn(),
          end: vi.fn(),
        } as any;
      });

      const result = await UpdateChecker.checkForUpdate();

      expect(result.hasUpdate).toBe(false);
      expect(result.current).toBe('1.0.0');
      expect(result.latest).toBe('1.0.1-rc.1');
    });

    it('should NOT show update when both are RC (same base version)', async () => {
      mockGetVersion.mockReturnValue('1.0.0-rc.1');

      mockRequest.mockImplementation((_options, callback) => {
        const res = {
          statusCode: 200,
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              handler(Buffer.from('{"version":"1.0.0-rc.2"}'));
            }
            if (event === 'end') {
              handler();
            }
          }),
        } as unknown as IncomingMessage;
        callback(res as IncomingMessage);
        return {
          on: vi.fn(),
          end: vi.fn(),
        } as any;
      });

      const result = await UpdateChecker.checkForUpdate();

      expect(result.hasUpdate).toBe(false);
      expect(result.current).toBe('1.0.0-rc.1');
      expect(result.latest).toBe('1.0.0-rc.2');
    });

    it('should detect update for stable to newer stable', async () => {
      mockGetVersion.mockReturnValue('1.0.0');

      mockRequest.mockImplementation((_options, callback) => {
        const res = {
          statusCode: 200,
          on: vi.fn((event, handler) => {
            if (event === 'data') {
              handler(Buffer.from('{"version":"1.0.1"}'));
            }
            if (event === 'end') {
              handler();
            }
          }),
        } as unknown as IncomingMessage;
        callback(res as IncomingMessage);
        return {
          on: vi.fn(),
          end: vi.fn(),
        } as any;
      });

      const result = await UpdateChecker.checkForUpdate();

      expect(result.hasUpdate).toBe(true);
      expect(result.current).toBe('1.0.0');
      expect(result.latest).toBe('1.0.1');
    });
  });
});
