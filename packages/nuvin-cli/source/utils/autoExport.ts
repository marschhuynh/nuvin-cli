import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { MemoryPort } from '@nuvin/nuvin-core';

export async function autoExportHistory(memory: MemoryPort | undefined, reason: string): Promise<string | null> {
  if (!memory) {
    return null;
  }

  try {
    const messages = await memory.get('cli');

    if (!messages || messages.length === 0) {
      return null;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `nuvin-crash-export-${timestamp}.json`;
    const outputPath = path.resolve(process.cwd(), filename);

    const exportData = {
      cli: messages,
      metadata: {
        exportReason: reason,
        timestamp: new Date().toISOString(),
        messageCount: messages.length,
      },
    };

    await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2), 'utf-8');

    return outputPath;
  } catch (err) {
    console.error('Failed to auto-export history:', err);
    return null;
  }
}
