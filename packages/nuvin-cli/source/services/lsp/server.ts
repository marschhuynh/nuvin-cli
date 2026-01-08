import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn, execSync } from 'node:child_process';
import type { LSPServerInfo, LSPServerHandle } from './types.js';

const LSP_BIN_DIR = path.join(process.env.HOME || '~', '.nuvin', 'lsp', 'bin');

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
	const nuvinBin = path.join(LSP_BIN_DIR, name);
	try {
		await fs.promises.access(nuvinBin, fs.constants.X_OK);
		return nuvinBin;
	} catch {}

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

	return undefined;
}

async function installPackage(packageName: string): Promise<boolean> {
	if (process.env.NUVIN_DISABLE_LSP_DOWNLOAD === 'true') {
		console.error(`[LSP] Auto-install disabled. Install ${packageName} manually.`);
		return false;
	}

	console.error(`[LSP] Installing ${packageName}...`);

	try {
		await fs.promises.mkdir(LSP_BIN_DIR, { recursive: true });

		execSync(`npm install --prefix "${path.dirname(LSP_BIN_DIR)}" ${packageName}`, {
			stdio: process.env.NUVIN_LSP_DEBUG ? 'inherit' : 'pipe',
			timeout: 60000,
		});

		console.error(`[LSP] Successfully installed ${packageName}`);
		return true;
	} catch (err) {
		console.error(`[LSP] Failed to install ${packageName}:`, err instanceof Error ? err.message : err);
		return false;
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
			const installed = await installPackage('typescript-language-server');
			if (installed) {
				binary = path.join(LSP_BIN_DIR, 'typescript-language-server');
			}
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

export const BUILTIN_SERVERS: LSPServerInfo[] = [TypeScriptServer];

export function getServerForFile(file: string): LSPServerInfo | undefined {
	const ext = path.extname(file).toLowerCase();
	return BUILTIN_SERVERS.find((server) => server.extensions.includes(ext));
}

export function getServerById(id: string): LSPServerInfo | undefined {
	return BUILTIN_SERVERS.find((server) => server.id === id);
}
