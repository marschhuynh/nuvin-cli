import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

let cachedRgPath: string | null = null;

export type RipgrepMatch = {
  filePath: string;
  isContext?: boolean;
  lineNum: number;
  lineText: string;
};

function findSystemRipgrep(): string | null {
  const isWindows = os.platform() === "win32";
  const candidates = isWindows
    ? [
        path.join(process.env.LOCALAPPDATA || "", "Microsoft", "WinGet", "Packages"),
        path.join(process.env.ProgramFiles || "", "ripgrep", "rg.exe"),
        path.join(process.env["ProgramFiles(x86)"] || "", "ripgrep", "rg.exe"),
      ]
    : ["/opt/homebrew/bin/rg", "/usr/local/bin/rg", "/usr/bin/rg", "/bin/rg"];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  try {
    const command = isWindows ? "where rg" : "which rg";
    const result = execSync(command, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    })
      .trim()
      .split(/\r?\n/)[0];
    if (result && existsSync(result)) return result;
  } catch {
    return null;
  }

  return null;
}

export async function filepath(): Promise<string> {
  if (cachedRgPath) return cachedRgPath;

  const systemRg = findSystemRipgrep();
  if (!systemRg) {
    throw new Error("ripgrep executable not found. Install rg to use Glob and Grep tools.");
  }

  cachedRgPath = systemRg;
  return systemRg;
}

export async function* files(opts: { cwd: string; glob?: string[] }): AsyncGenerator<string> {
  const rgPath = await filepath();
  const cwdStat = await stat(opts.cwd).catch(() => null);
  if (!cwdStat?.isDirectory()) {
    throw Object.assign(new Error(`No such file or directory: '${opts.cwd}'`), { code: "ENOENT" });
  }

  const args = ["--files", "--follow", "--hidden", "--glob=!.git/*"];
  for (const glob of opts.glob ?? []) {
    args.push(`--glob=${glob}`);
  }

  const proc = spawn(rgPath, args, {
    cwd: opts.cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let buffer = "";
  for await (const chunk of proc.stdout ?? []) {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.length > 0) yield line;
    }
  }

  if (buffer.trim().length > 0) {
    yield buffer.trim();
  }
}

function parseMatchLine(line: string, contextMode: boolean): RipgrepMatch | null {
  if (!line || line === "--") return null;

  const parts = line.split("|");
  if (contextMode && parts.length >= 4 && Number.isFinite(Number.parseInt(parts[2] ?? "", 10))) {
    const lineNum = Number.parseInt(parts[1] ?? "", 10);
    if (!Number.isFinite(lineNum) || !parts[0]) return null;
    return {
      filePath: parts[0],
      lineNum,
      lineText: parts.slice(3).join("|"),
    };
  }

  if (parts.length >= 3) {
    const lineNum = Number.parseInt(parts[1] ?? "", 10);
    if (!Number.isFinite(lineNum) || !parts[0]) return null;
    return {
      filePath: parts[0],
      lineNum,
      lineText: parts.slice(2).join("|"),
      ...(contextMode ? { isContext: true } : {}),
    };
  }

  return null;
}

export async function search(opts: {
  context?: number;
  cwd: string;
  file?: string;
  glob?: string;
  limit?: number;
  pattern: string;
}): Promise<RipgrepMatch[]> {
  const rgPath = await filepath();

  if (opts.file) {
    const fileStat = await stat(opts.file).catch(() => null);
    if (!fileStat?.isFile()) {
      throw Object.assign(new Error(`No such file: '${opts.file}'`), { code: "ENOENT" });
    }
  } else {
    const cwdStat = await stat(opts.cwd).catch(() => null);
    if (!cwdStat?.isDirectory()) {
      throw Object.assign(new Error(`No such file or directory: '${opts.cwd}'`), {
        code: "ENOENT",
      });
    }
  }

  const args = [
    "-nH",
    "--field-match-separator=|",
    "--field-context-separator=|",
    "--regexp",
    opts.pattern,
  ];

  const contextMode = typeof opts.context === "number" && opts.context > 0;
  if (contextMode) {
    args.push("-C", String(opts.context), "--column");
  }

  if (opts.glob && !opts.file) {
    args.push("--glob", opts.glob);
  }

  args.push(opts.file ?? opts.cwd);

  return await new Promise<RipgrepMatch[]>((resolve, reject) => {
    const proc = spawn(rgPath, args, {
      cwd: opts.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", (code) => {
      if (code === 1 && stdout === "") {
        resolve([]);
        return;
      }

      if (code !== 0 && code !== 1) {
        reject(new Error(`ripgrep failed: ${stderr}`));
        return;
      }

      const limit = opts.limit ?? 100;
      const results: RipgrepMatch[] = [];
      for (const line of stdout.split(/\r?\n/)) {
        if (results.length >= limit) break;
        const match = parseMatchLine(line, contextMode);
        if (match) results.push(match);
      }

      resolve(results);
    });
    proc.on("error", reject);
  });
}
