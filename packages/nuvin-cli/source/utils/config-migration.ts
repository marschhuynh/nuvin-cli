/**
 * Migration utility: .nuvin-cli → .nuvin
 *
 * TODO: Remove this file after migration period (e.g., v1.x release)
 *
 * Migration flow:
 * 1. First run: Copy files from .nuvin-cli to .nuvin, create .migration-complete marker in old dir
 * 2. Next run: If marker exists in old dir, delete old dir entirely
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';

const OLD_DIR_NAME = '.nuvin-cli';
const NEW_DIR_NAME = '.nuvin';
const MIGRATION_MARKER = '.migration-complete';

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.name === MIGRATION_MARKER) continue;

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      if (!(await exists(destPath))) {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

async function removeDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

async function migrateDir(oldDir: string, newDir: string): Promise<void> {
  const markerPath = path.join(oldDir, MIGRATION_MARKER);
  const oldExists = await exists(oldDir);
  const markerExists = await exists(markerPath);

  if (markerExists) {
    await removeDir(oldDir);
    return;
  }

  if (oldExists) {
    await copyDir(oldDir, newDir);
    await fs.writeFile(markerPath, new Date().toISOString());
  }
}

export async function runConfigMigration(): Promise<void> {
  try {
    const globalOld = path.join(os.homedir(), OLD_DIR_NAME);
    const globalNew = path.join(os.homedir(), NEW_DIR_NAME);
    await migrateDir(globalOld, globalNew);

    const localOld = path.join(process.cwd(), OLD_DIR_NAME);
    const localNew = path.join(process.cwd(), NEW_DIR_NAME);
    await migrateDir(localOld, localNew);
  } catch {
    // Silent fail - migration is best-effort
  }
}
