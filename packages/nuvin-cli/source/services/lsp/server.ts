import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawn } from 'node:child_process';
import type { LSPServerInfo, LSPServerHandle } from './types.js';

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

async function findNearestNodeModules(startDir: string): Promise<string | undefined> {
	let dir = startDir;
	const root = path.parse(dir).root;

	while (dir !== root) {
		const candidate = path.join(dir, 'node_modules', '.bin');
		try {
			await fs.promises.access(candidate);
			return candidate;
		} catch {
			dir = path.dirname(dir);
		}
	}
	return undefined;
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
		const binDir = await findNearestNodeModules(root);
		let command: string;
		let args: string[];

		if (binDir) {
			const localTsServer = path.join(binDir, 'typescript-language-server');
			try {
				await fs.promises.access(localTsServer);
				command = localTsServer;
				args = ['--stdio'];
			} catch {
				command = 'npx';
				args = ['typescript-language-server', '--stdio'];
			}
		} else {
			command = 'npx';
			args = ['typescript-language-server', '--stdio'];
		}

		try {
			const proc = spawn(command, args, {
				cwd: root,
				stdio: ['pipe', 'pipe', 'pipe'],
				env: { ...process.env, NODE_OPTIONS: '' },
			});

			proc.on('error', (err) => {
				console.error(`[LSP] TypeScript server error:`, err.message);
			});

			proc.stderr?.on('data', (data) => {
				if (process.env.NUVIN_LSP_DEBUG) {
					console.error(`[LSP-TS] ${data.toString()}`);
				}
			});

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
