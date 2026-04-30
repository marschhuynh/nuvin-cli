import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { getWorkspaceContext } from '../source/services/WorkspaceContextService.js';

const tempDirs: string[] = [];

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('WorkspaceContextService', () => {
  it('uses realpath cwd when not in git repository', async () => {
    const dir = await createTempDir('nuvin-ws-no-git-');
    const context = getWorkspaceContext(dir);
    expect(context.workspaceRoot).toBe(path.resolve(dir));
    expect(context.workspaceId.startsWith('ws_')).toBe(true);
  });

  it('resolves git top-level from nested directories', async () => {
    const root = await createTempDir('nuvin-ws-git-');
    const nested = path.join(root, 'src', 'feature');
    await fs.mkdir(nested, { recursive: true });
    execSync('git init', { cwd: root, stdio: 'ignore' });

    const rootContext = getWorkspaceContext(root);
    const nestedContext = getWorkspaceContext(nested);

    expect(nestedContext.workspaceRoot).toBe(rootContext.workspaceRoot);
    expect(nestedContext.workspaceId).toBe(rootContext.workspaceId);
  });
});
