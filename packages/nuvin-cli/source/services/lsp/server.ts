import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import type { LSPServerInfo, LSPServerHandle } from './types.js';

const LSP_DIR = path.join(process.env.HOME || '~', '.nuvin', 'lsp');
const LSP_BIN_DIR = path.join(LSP_DIR, 'node_modules', '.bin');

async function findFileUp(startDir: string, filename: string): Promise<string | undefined> {
  let dir = startDir;
  const root = path.parse(dir).root;

  while (dir !== root) {
    const candidate = path.join(dir, filename);
    try {
      await fs.promises.access(candidate);
      return dir;
    } catch {
      dir = path.dirname(dir);
    }
  }
  return undefined;
}

async function findExecutable(name: string, startDir: string): Promise<string | undefined> {
  let dir = startDir;
  const root = path.parse(dir).root;

  while (dir !== root) {
    const candidate = path.join(dir, 'node_modules', '.bin', name);
    try {
      await fs.promises.access(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      dir = path.dirname(dir);
    }
  }

  const nuvinBin = path.join(LSP_BIN_DIR, name);
  try {
    await fs.promises.access(nuvinBin, fs.constants.X_OK);
    return nuvinBin;
  } catch {}

  return undefined;
}

async function installPackage(packageName: string): Promise<string | undefined> {
  if (process.env.NUVIN_DISABLE_LSP_DOWNLOAD === 'true') {
    console.error(`[LSP] Auto-install disabled. Install ${packageName} manually.`);
    return undefined;
  }

  console.error(`[LSP] Installing ${packageName}...`);

  try {
    await fs.promises.mkdir(LSP_DIR, { recursive: true });

    execSync(`npm install --prefix "${LSP_DIR}" ${packageName}`, {
      stdio: process.env.NUVIN_LSP_DEBUG ? 'inherit' : 'pipe',
      timeout: 60000,
    });

    const binPath = path.join(LSP_BIN_DIR, packageName);
    try {
      await fs.promises.access(binPath, fs.constants.X_OK);
      console.error(`[LSP] Successfully installed ${packageName}`);
      return binPath;
    } catch {
      console.error(`[LSP] Installed ${packageName} but binary not found at ${binPath}`);
      return undefined;
    }
  } catch (err) {
    console.error(`[LSP] Failed to install ${packageName}:`, err instanceof Error ? err.message : err);
    return undefined;
  }
}

export const TypeScriptServer: LSPServerInfo = {
  id: 'typescript',
  name: 'TypeScript Language Server',
  extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'],

  async root(file: string): Promise<string | undefined> {
    const dir = path.dirname(file);
    const tsConfigRoot = await findFileUp(dir, 'tsconfig.json');
    if (tsConfigRoot) return tsConfigRoot;
    const jsConfigRoot = await findFileUp(dir, 'jsconfig.json');
    if (jsConfigRoot) return jsConfigRoot;
    return findFileUp(dir, 'package.json');
  },

  async spawn(root: string): Promise<LSPServerHandle | undefined> {
    let binary = await findExecutable('typescript-language-server', root);

    if (!binary) {
      binary = await installPackage('typescript-language-server');
    }

    if (!binary) {
      console.error('[LSP] typescript-language-server not found and could not be installed');
      return undefined;
    }

    if (process.env.NUVIN_LSP_DEBUG) {
      console.error(`[LSP] Spawning TypeScript server: ${binary} --stdio`);
    }

    try {
      const proc = spawn(binary, ['--stdio'], {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_OPTIONS: '' },
      });

      let spawnError: Error | null = null;

      proc.on('error', (err) => {
        spawnError = err;
        console.error(`[LSP] TypeScript server error:`, err.message);
      });

      proc.on('exit', (code, signal) => {
        if (code !== null && code !== 0) {
          console.error(`[LSP] TypeScript server exited with code ${code}`);
        } else if (signal) {
          console.error(`[LSP] TypeScript server killed by signal ${signal}`);
        }
      });

      proc.stderr?.on('data', (data) => {
        if (process.env.NUVIN_LSP_DEBUG) {
          console.error(`[LSP-TS] ${data.toString()}`);
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      if (spawnError || proc.killed || proc.exitCode !== null) {
        console.error(`[LSP] TypeScript server failed to start`);
        return undefined;
      }

      return {
        process: proc,
        initialization: {
          preferences: {
            includeInlayParameterNameHints: 'none',
            includeInlayPropertyDeclarationTypeHints: false,
            includeInlayFunctionLikeReturnTypeHints: false,
          },
        },
      };
    } catch (err) {
      console.error(`[LSP] Failed to spawn TypeScript server:`, err);
      return undefined;
    }
  },
};

export const PythonServer: LSPServerInfo = {
  id: 'python',
  name: 'Pyright',
  extensions: ['.py', '.pyi', '.pyw'],

  async root(file: string): Promise<string | undefined> {
    const dir = path.dirname(file);
    const pyprojectRoot = await findFileUp(dir, 'pyproject.toml');
    if (pyprojectRoot) return pyprojectRoot;
    const setupRoot = await findFileUp(dir, 'setup.py');
    if (setupRoot) return setupRoot;
    const reqRoot = await findFileUp(dir, 'requirements.txt');
    if (reqRoot) return reqRoot;
    return findFileUp(dir, '.git');
  },

  async spawn(root: string): Promise<LSPServerHandle | undefined> {
    let binary = await findExecutable('pyright', root);

    if (!binary) {
      binary = await installPackage('pyright');
    }

    if (!binary) {
      console.error('[LSP] pyright not found and could not be installed');
      return undefined;
    }

    if (process.env.NUVIN_LSP_DEBUG) {
      console.error(`[LSP] Spawning Pyright server: ${binary} --stdio`);
    }

    try {
      const proc = spawn(binary, ['--stdio'], {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_OPTIONS: '' },
      });

      let spawnError: Error | null = null;

      proc.on('error', (err) => {
        spawnError = err;
        console.error(`[LSP] Pyright server error:`, err.message);
      });

      proc.on('exit', (code, signal) => {
        if (code !== null && code !== 0) {
          console.error(`[LSP] Pyright server exited with code ${code}`);
        } else if (signal) {
          console.error(`[LSP] Pyright server killed by signal ${signal}`);
        }
      });

      proc.stderr?.on('data', (data) => {
        if (process.env.NUVIN_LSP_DEBUG) {
          console.error(`[LSP-PY] ${data.toString()}`);
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      if (spawnError || proc.killed || proc.exitCode !== null) {
        console.error(`[LSP] Pyright server failed to start`);
        return undefined;
      }

      return {
        process: proc,
      };
    } catch (err) {
      console.error(`[LSP] Failed to spawn Pyright server:`, err);
      return undefined;
    }
  },
};

export const BiomeServer: LSPServerInfo = {
  id: 'biome',
  name: 'Biome',
  extensions: ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.mts', '.cts', '.json', '.jsonc'],

  async root(file: string): Promise<string | undefined> {
    const dir = path.dirname(file);
    // Only use Biome if biome.json exists
    const biomeRoot = await findFileUp(dir, 'biome.json');
    if (biomeRoot) return biomeRoot;
    // Check for biome.jsonc as well
    const biomeCRoot = await findFileUp(dir, 'biome.jsonc');
    if (biomeCRoot) return biomeCRoot;
    return undefined;
  },

  async spawn(root: string): Promise<LSPServerHandle | undefined> {
    let binary = await findExecutable('biome', root);

    if (!binary) {
      binary = await installPackage('@biomejs/biome');
    }

    if (!binary) {
      console.error('[LSP] biome not found and could not be installed');
      return undefined;
    }

    if (process.env.NUVIN_LSP_DEBUG) {
      console.error(`[LSP] Spawning Biome server: ${binary} lsp-proxy`);
    }

    try {
      const proc = spawn(binary, ['lsp-proxy'], {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, NODE_OPTIONS: '' },
      });

      let spawnError: Error | null = null;

      proc.on('error', (err) => {
        spawnError = err;
        console.error(`[LSP] Biome server error:`, err.message);
      });

      proc.on('exit', (code, signal) => {
        if (code !== null && code !== 0) {
          console.error(`[LSP] Biome server exited with code ${code}`);
        } else if (signal) {
          console.error(`[LSP] Biome server killed by signal ${signal}`);
        }
      });

      proc.stderr?.on('data', (data) => {
        if (process.env.NUVIN_LSP_DEBUG) {
          console.error(`[LSP-BIOME] ${data.toString()}`);
        }
      });

      await new Promise((resolve) => setTimeout(resolve, 100));
      if (spawnError || proc.killed || proc.exitCode !== null) {
        console.error(`[LSP] Biome server failed to start`);
        return undefined;
      }

      return {
        process: proc,
      };
    } catch (err) {
      console.error(`[LSP] Failed to spawn Biome server:`, err);
      return undefined;
    }
  },
};

export const BUILTIN_SERVERS: LSPServerInfo[] = [TypeScriptServer, PythonServer, BiomeServer];

export function getServersForFile(file: string): LSPServerInfo[] {
  const ext = path.extname(file).toLowerCase();
  return BUILTIN_SERVERS.filter((server) => server.extensions.includes(ext));
}

export function getServerForFile(file: string): LSPServerInfo | undefined {
  return getServersForFile(file)[0];
}

export function getServerById(id: string): LSPServerInfo | undefined {
  return BUILTIN_SERVERS.find((server) => server.id === id);
}
