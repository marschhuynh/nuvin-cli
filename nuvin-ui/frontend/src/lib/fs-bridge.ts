import { isWailsEnvironment } from '@/lib/wails-runtime';

export interface FileInfo {
  path: string;
  name: string;
  isDir: boolean;
  size: number;
  modTime: string; // RFC3339 from Go
}

const isNode = typeof process !== 'undefined' && !!(process as any).versions?.node;

async function nodeFs() {
  // Dynamically import to avoid bundling in browser
  const mod = await import('fs/promises');
  return mod;
}

export async function readFile(path: string): Promise<string> {
  if (isWailsEnvironment() && window.go?.main?.App) {
    return window.go.main.App.ReadFile(path);
  }
  if (isNode) {
    const fs = await nodeFs();
    return fs.readFile(path, 'utf-8');
  }
  throw new Error('Filesystem access requires Wails or Node environment');
}

export async function writeFile(path: string, content: string): Promise<void> {
  if (isWailsEnvironment() && window.go?.main?.App) {
    return window.go.main.App.WriteFile({ path, content });
  }
  if (isNode) {
    const fs = await nodeFs();
    await fs.mkdir(path.slice(0, Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))), { recursive: true }).catch(() => { });
    return fs.writeFile(path, content, 'utf-8') as unknown as Promise<void>;
  }
  throw new Error('Filesystem access requires Wails or Node environment');
}

export async function listDir(dir: string): Promise<FileInfo[]> {
  if (isWailsEnvironment() && window.go?.main?.App) {
    return window.go.main.App.ListDir(dir);
  }
  if (isNode) {
    const fs = await nodeFs();
    const entries = await fs.readdir(dir, { withFileTypes: true }) as any[];
    const results: FileInfo[] = [];
    for (const e of entries) {
      const full = dir.endsWith('/') || dir.endsWith('\\') ? dir + e.name : dir + (dir.includes('\\') ? '\\' : '/') + e.name;
      const stat = await fs.stat(full);
      results.push({
        path: full,
        name: e.name,
        isDir: e.isDirectory?.() ?? stat.isDirectory(),
        size: stat.size,
        modTime: new Date(stat.mtimeMs).toISOString(),
      });
    }
    return results;
  }
  throw new Error('Filesystem access requires Wails or Node environment');
}

export async function mkdirAll(dir: string): Promise<void> {
  if (isWailsEnvironment() && window.go?.main?.App) {
    return window.go.main.App.MkdirAll(dir);
  }
  if (isNode) {
    const fs = await nodeFs();
    return fs.mkdir(dir, { recursive: true }) as unknown as Promise<void>;
  }
  throw new Error('Filesystem access requires Wails or Node environment');
}

export async function remove(path: string, recursive = false): Promise<void> {
  if (isWailsEnvironment() && window.go?.main?.App) {
    return window.go.main.App.Remove(path, recursive);
  }
  if (isNode) {
    const fs = await nodeFs();
    // Node 14+: fs.rm supports recursive
    const rm: any = (fs as any).rm ?? (fs as any).rmdir;
    if ((fs as any).rm) {
      return rm(path, { recursive, force: true });
    }
    if (recursive) {
      // naive recursive fallback for older nodes not needed in tests
      return (fs as any).rmdir(path, { recursive: true });
    }
    return (fs as any).unlink(path);
  }
  throw new Error('Filesystem access requires Wails or Node environment');
}

export async function rename(oldPath: string, newPath: string): Promise<void> {
  if (isWailsEnvironment() && window.go?.main?.App) {
    return window.go.main.App.Rename(oldPath, newPath);
  }
  if (isNode) {
    const fs = await nodeFs();
    await fs.mkdir(newPath.slice(0, Math.max(newPath.lastIndexOf('/'), newPath.lastIndexOf('\\'))), { recursive: true }).catch(() => { });
    return fs.rename(oldPath, newPath) as unknown as Promise<void>;
  }
  throw new Error('Filesystem access requires Wails or Node environment');
}

export async function pathExists(path: string): Promise<boolean> {
  if (isWailsEnvironment() && window.go?.main?.App) {
    return window.go.main.App.PathExists(path);
  }
  if (isNode) {
    const fs = await nodeFs();
    try {
      await (fs as any).access(path);
      return true;
    } catch {
      return false;
    }
  }
  throw new Error('Filesystem access requires Wails or Node environment');
}
