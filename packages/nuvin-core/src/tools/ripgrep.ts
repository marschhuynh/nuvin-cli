import { spawn, execSync } from 'node:child_process';
import { existsSync, mkdirSync, createWriteStream, chmodSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as https from 'node:https';

const RIPGREP_VERSION = '14.1.1';

const PLATFORM_MAP: Record<string, { platform: string; extension: 'tar.gz' | 'zip' }> = {
  'arm64-darwin': { platform: 'aarch64-apple-darwin', extension: 'tar.gz' },
  'arm64-linux': { platform: 'aarch64-unknown-linux-gnu', extension: 'tar.gz' },
  'x64-darwin': { platform: 'x86_64-apple-darwin', extension: 'tar.gz' },
  'x64-linux': { platform: 'x86_64-unknown-linux-musl', extension: 'tar.gz' },
  'x64-win32': { platform: 'x86_64-pc-windows-msvc', extension: 'zip' },
};

let cachedRgPath: string | null = null;

function findSystemRipgrep(): string | null {
  const isWindows = os.platform() === 'win32';

  if (isWindows) {
    const windowsPaths = [
      path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', 'BurntSushi.ripgrep.MSVC_Microsoft.Winget.Source_8wekyb3d8bbwe', 'ripgrep-14.1.1-x86_64-pc-windows-msvc', 'rg.exe'),
      path.join(process.env.ProgramFiles || '', 'ripgrep', 'rg.exe'),
      path.join(process.env['ProgramFiles(x86)'] || '', 'ripgrep', 'rg.exe'),
    ];
    for (const p of windowsPaths) {
      if (existsSync(p)) return p;
    }
    try {
      const result = execSync('where rg', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim().split('\n')[0];
      if (result && existsSync(result)) return result;
    } catch {}
  } else {
    const unixPaths = [
      '/opt/homebrew/bin/rg',
      '/usr/local/bin/rg',
      '/usr/bin/rg',
      '/bin/rg',
    ];
    for (const p of unixPaths) {
      if (existsSync(p)) return p;
    }
    try {
      const result = execSync('which rg', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      if (result && existsSync(result)) return result;
    } catch {}
  }

  return null;
}

function getCacheDir(): string {
  const nuvinDir = path.join(os.homedir(), '.nuvin', 'bin');
  if (!existsSync(nuvinDir)) {
    mkdirSync(nuvinDir, { recursive: true });
  }
  return nuvinDir;
}

function getCachedRgPath(): string {
  const cacheDir = getCacheDir();
  const isWindows = os.platform() === 'win32';
  return path.join(cacheDir, isWindows ? 'rg.exe' : 'rg');
}

async function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const follow = (currentUrl: string, redirectCount = 0) => {
      if (redirectCount > 5) {
        reject(new Error('Too many redirects'));
        return;
      }

      https.get(currentUrl, (response) => {
        if (response.statusCode === 301 || response.statusCode === 302) {
          const location = response.headers.location;
          if (location) {
            follow(location, redirectCount + 1);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
          return;
        }

        const file = createWriteStream(dest);
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
        file.on('error', (err) => {
          file.close();
          reject(err);
        });
      }).on('error', reject);
    };

    follow(url);
  });
}

async function extractTarGz(tarPath: string, destDir: string, rgFilename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempExtractDir = path.join(os.tmpdir(), `ripgrep-extract-${Date.now()}`);
    mkdirSync(tempExtractDir, { recursive: true });

    const proc = spawn('tar', ['-xzf', tarPath, '-C', tempExtractDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`tar extraction failed: ${stderr}`));
        return;
      }

      try {
        const { readdirSync, copyFileSync, rmSync } = await import('node:fs');
        
        const findRg = (dir: string): string | null => {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile() && entry.name === rgFilename) {
              return fullPath;
            }
            if (entry.isDirectory()) {
              const found = findRg(fullPath);
              if (found) return found;
            }
          }
          return null;
        };

        const rgPath = findRg(tempExtractDir);
        if (!rgPath) {
          reject(new Error(`${rgFilename} not found in extracted archive`));
          return;
        }

        const destPath = path.join(destDir, rgFilename);
        copyFileSync(rgPath, destPath);
        chmodSync(destPath, 0o755);
        
        rmSync(tempExtractDir, { recursive: true, force: true });
        resolve(destPath);
      } catch (err) {
        reject(err);
      }
    });
    proc.on('error', reject);
  });
}

async function extractZip(zipPath: string, destDir: string, rgFilename: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempExtractDir = path.join(os.tmpdir(), `ripgrep-extract-${Date.now()}`);
    mkdirSync(tempExtractDir, { recursive: true });

    const proc = spawn('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path "${zipPath}" -DestinationPath "${tempExtractDir}" -Force`,
    ], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`zip extraction failed: ${stderr}`));
        return;
      }

      try {
        const { readdirSync, copyFileSync, rmSync } = await import('node:fs');
        
        const findRg = (dir: string): string | null => {
          const entries = readdirSync(dir, { withFileTypes: true });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isFile() && entry.name === rgFilename) {
              return fullPath;
            }
            if (entry.isDirectory()) {
              const found = findRg(fullPath);
              if (found) return found;
            }
          }
          return null;
        };

        const rgPath = findRg(tempExtractDir);
        if (!rgPath) {
          reject(new Error(`${rgFilename} not found in extracted archive`));
          return;
        }

        const destPath = path.join(destDir, rgFilename);
        copyFileSync(rgPath, destPath);
        
        rmSync(tempExtractDir, { recursive: true, force: true });
        resolve(destPath);
      } catch (err) {
        reject(err);
      }
    });
    proc.on('error', reject);
  });
}

async function downloadRipgrep(): Promise<string> {
  const key = `${os.arch()}-${os.platform()}`;
  const info = PLATFORM_MAP[key];
  if (!info) {
    throw new Error(`Unsupported platform: ${key}. Please install ripgrep manually.`);
  }

  const cachedPath = getCachedRgPath();
  if (existsSync(cachedPath)) {
    return cachedPath;
  }

  const filename = `ripgrep-${RIPGREP_VERSION}-${info.platform}.${info.extension}`;
  const url = `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/${filename}`;

  const tempDir = path.join(os.tmpdir(), `ripgrep-download-${Date.now()}`);
  mkdirSync(tempDir, { recursive: true });

  const archivePath = path.join(tempDir, filename);

  try {
    await downloadFile(url, archivePath);

    const cacheDir = getCacheDir();
    const isWindows = os.platform() === 'win32';
    const rgFilename = isWindows ? 'rg.exe' : 'rg';

    if (info.extension === 'tar.gz') {
      await extractTarGz(archivePath, cacheDir, rgFilename);
    } else {
      await extractZip(archivePath, cacheDir, rgFilename);
    }

    return cachedPath;
  } finally {
    try {
      const { rmSync } = await import('node:fs');
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

export async function filepath(): Promise<string> {
  if (cachedRgPath) {
    return cachedRgPath;
  }

  const systemRg = findSystemRipgrep();
  if (systemRg) {
    cachedRgPath = systemRg;
    return systemRg;
  }

  const downloadedRg = await downloadRipgrep();
  cachedRgPath = downloadedRg;
  return downloadedRg;
}

export async function* files(opts: { cwd: string; glob?: string[] }): AsyncGenerator<string> {
  const rgPath = await filepath();

  const { stat } = await import('node:fs/promises');
  const cwdStat = await stat(opts.cwd).catch(() => null);
  if (!cwdStat?.isDirectory()) {
    throw Object.assign(new Error(`No such file or directory: '${opts.cwd}'`), { code: 'ENOENT' });
  }

  const args = ['--files', '--follow', '--hidden', '--glob=!.git/*'];

  if (opts.glob) {
    for (const g of opts.glob) {
      args.push(`--glob=${g}`);
    }
  }

  const proc = spawn(rgPath, args, {
    cwd: opts.cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let buffer = '';

  for await (const chunk of proc.stdout!) {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (line) yield line;
    }
  }

  if (buffer.trim()) {
    yield buffer.trim();
  }
}

export async function search(opts: {
  cwd: string;
  pattern: string;
  glob?: string;
  limit?: number;
  file?: string;
  context?: number;
}): Promise<{ filePath: string; lineNum: number; lineText: string; isContext?: boolean }[]> {
  const rgPath = await filepath();

  const { stat } = await import('node:fs/promises');

  // If searching a specific file
  if (opts.file) {
    const fileStat = await stat(opts.file).catch(() => null);
    if (!fileStat?.isFile()) {
      throw Object.assign(new Error(`No such file: '${opts.file}'`), { code: 'ENOENT' });
    }
  } else {
    const cwdStat = await stat(opts.cwd).catch(() => null);
    if (!cwdStat?.isDirectory()) {
      throw Object.assign(new Error(`No such file or directory: '${opts.cwd}'`), { code: 'ENOENT' });
    }
  }

  const args = ['-nH', '--field-match-separator=|', '--field-context-separator=|', '--regexp', opts.pattern];

  // Add context lines if specified
  if (opts.context && opts.context > 0) {
    args.push('-C', String(opts.context), '--column');
  }

  // glob only applies to directory search
  if (opts.glob && !opts.file) {
    args.push('--glob', opts.glob);
  }

  // Search specific file or directory
  args.push(opts.file ?? opts.cwd);

  return new Promise((resolve, reject) => {
    const proc = spawn(rgPath, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr?.on('data', (chunk) => { stderr += chunk.toString(); });

    proc.on('close', (code) => {
      if (code === 1 && stdout === '') {
        resolve([]);
        return;
      }

      if (code !== 0 && code !== 1) {
        reject(new Error(`ripgrep failed: ${stderr}`));
        return;
      }

      const results: { filePath: string; lineNum: number; lineText: string; isContext?: boolean }[] = [];
      const limit = opts.limit ?? 100;

      const lines = stdout.split(/\r?\n/);
      for (const line of lines) {
        if (!line || line === '--') continue;
        if (results.length >= limit) break;

        let filePath: string;
        let lineNum: number;
        let lineText: string;
        let isContext = false;

        // With --column, match lines have 4 fields: filepath|linenum|colnum|text
        // Context lines have 3 fields: filepath|linenum|text
        // Without context, all lines are matches with 3 fields: filepath|linenum|text
        const parts = line.split('|');
        
        if (opts.context && parts.length >= 4 && !isNaN(parseInt(parts[2], 10))) {
          // Match line with column: filepath|linenum|colnum|text
          filePath = parts[0];
          lineNum = parseInt(parts[1], 10);
          lineText = parts.slice(3).join('|');
        } else if (parts.length >= 3) {
          // Context line or non-context match: filepath|linenum|text
          filePath = parts[0];
          lineNum = parseInt(parts[1], 10);
          lineText = parts.slice(2).join('|');
          isContext = !!opts.context; // Only mark as context if context mode is enabled
        } else {
          continue;
        }

        if (filePath && !isNaN(lineNum)) {
          results.push({ filePath, lineNum, lineText, ...(isContext ? { isContext } : {}) });
        }
      }

      resolve(results);
    });

    proc.on('error', reject);
  });
}
