import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs';

export type RuntimeEnvInfo = {
  cwd: string;
  platform: string;
  arch: string;
  today: string;
  tempDir: string;
  workspaceDir: string;
};

export type RuntimeEnvOptions = {
  appName?: string; // used for workspace root under temp dir
};

export class RuntimeEnv {
  private appName: string;
  private _workspaceDir: string | null = null;

  constructor(opts: RuntimeEnvOptions = {}) {
    this.appName = opts.appName || 'nuvin';
  }

  get workspaceDir(): string {
    if (!this._workspaceDir) {
      // Default to an app-scoped dir with a timestamp if init() wasn't called
      const fallback = path.join(os.tmpdir(), this.appName, String(Date.now()));
      try {
        fs.mkdirSync(fallback, { recursive: true });
      } catch {}
      this._workspaceDir = fallback;
    }
    return this._workspaceDir;
  }

  init(sessionId?: string): void {
    const base = path.join(os.tmpdir(), this.appName);
    try {
      fs.mkdirSync(base, { recursive: true });
    } catch {}
    const dir = sessionId ? path.join(base, sessionId) : path.join(base, String(Date.now()));
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
    this._workspaceDir = dir;
  }

  info(): RuntimeEnvInfo {
    return {
      cwd: safeCwd(),
      platform: process.platform,
      arch: process.arch,
      today: new Date().toString(),
      tempDir: os.tmpdir(),
      workspaceDir: this.workspaceDir,
    };
  }

  resolveInWorkspace(...segments: string[]): string {
    return path.join(this.workspaceDir, ...segments);
  }

  // No persistent path helpers; runtime env is ephemeral-only.
}

function safeCwd(): string {
  try {
    return process.cwd();
  } catch {
    return '';
  }
}
