import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import { autoExportHistory } from '@/utils/autoExport.js';
import type { Memory } from '@nuvin/nuvin-core';

vi.mock('node:fs/promises');

describe('autoExportHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return null if memory is undefined', async () => {
    const result = await autoExportHistory(undefined, 'test error');
    expect(result).toBeNull();
  });

  it('should return null if no messages in history', async () => {
    const mockMemory = {
      get: vi.fn().mockResolvedValue([]),
    } as unknown as Memory;

    const result = await autoExportHistory(mockMemory, 'test error');
    expect(result).toBeNull();
    expect(mockMemory.get).toHaveBeenCalledWith('cli');
  });

  it('should export history with metadata when messages exist', async () => {
    const mockMessages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there' },
    ];

    const mockMemory = {
      get: vi.fn().mockResolvedValue(mockMessages),
    } as unknown as Memory;

    vi.mocked(fs.writeFile).mockResolvedValue(undefined);

    const result = await autoExportHistory(mockMemory, 'Application crashed');

    expect(result).toMatch(/nuvin-crash-export-.*\.json$/);
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringMatching(/nuvin-crash-export-.*\.json$/),
      expect.stringContaining('Application crashed'),
      'utf-8',
    );

    const writeCall = vi.mocked(fs.writeFile).mock.calls[0];
    const exportData = JSON.parse(writeCall[1] as string);
    
    expect(exportData.cli).toEqual(mockMessages);
    expect(exportData.metadata.exportReason).toBe('Application crashed');
    expect(exportData.metadata.messageCount).toBe(2);
  });

  it('should handle write errors gracefully', async () => {
    const mockMemory = {
      get: vi.fn().mockResolvedValue([{ role: 'user', content: 'test' }]),
    } as unknown as Memory;

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(fs.writeFile).mockRejectedValue(new Error('Disk full'));

    const result = await autoExportHistory(mockMemory, 'test error');

    expect(result).toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to auto-export history:',
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });
});
