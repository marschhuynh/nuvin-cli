import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import chalk from 'chalk';
import type { CommandRegistry } from '@/modules/commands/types.js';

// ─── helpers ────────────────────────────────────────────────────────────────

function which(bin: string): string | null {
  try {
    const result = execSync(`which ${bin}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
    return result.trim() || null;
  } catch {
    return null;
  }
}

function checkPythonQuartz(): boolean {
  const result = spawnSync('/usr/bin/python3', ['-c', 'import Quartz'], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

function brewInstallCliclick(): boolean {
  const result = spawnSync('brew', ['install', 'cliclick'], {
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  return result.status === 0;
}

const PASS = chalk.green('✅');
const FAIL = chalk.red('❌');
const WARN = chalk.yellow('⚠️ ');
const ARROW = chalk.cyan('→');
const INDENT = '  ';

// ─── main check ─────────────────────────────────────────────────────────────

async function runComputerUseSetup(rawInput: string): Promise<void> {
  console.log('');
  console.log(`🖥️  ${chalk.bold('Computer Use Tool Setup')}`);
  console.log('');

  // 1. macOS guard
  if (process.platform !== 'darwin') {
    console.log(`${INDENT}${FAIL} Computer use tool is only supported on macOS`);
    console.log('');
    return;
  }

  // 2. ax-helper (Swift accessibility helper)
  const axHelperBin = path.join(os.homedir(), '.nuvin', 'bin', 'ax-helper');
  // Resolve ax-helper source from nuvin-core package location
  const nuvinCoreEntry = fileURLToPath(import.meta.resolve('@nuvin/nuvin-core'));
  const nuvinCorePkg = path.resolve(path.dirname(nuvinCoreEntry), '..');
  const axHelperSrc = path.join(nuvinCorePkg, 'src', 'tools', 'computer', 'ax-helper', 'main.swift');

  // Check if we need to rebuild (binary doesn't exist, source is newer, or --force flag)
  const args = rawInput.trim().split(/\s+/);
  const forceRebuild = args.includes('--force') || args.includes('-f');
  let needsBuild = !fs.existsSync(axHelperBin);

  if (!needsBuild && fs.existsSync(axHelperSrc)) {
    const binStat = fs.statSync(axHelperBin);
    const srcStat = fs.statSync(axHelperSrc);
    needsBuild = srcStat.mtime > binStat.mtime;
  }

  if (needsBuild || forceRebuild) {
    if (forceRebuild && fs.existsSync(axHelperBin)) {
      console.log(`${INDENT}${WARN} ${chalk.bold('ax-helper')} — force rebuild requested...`);
    } else if (needsBuild) {
      console.log(`${INDENT}${WARN} ${chalk.bold('ax-helper')} — not compiled or outdated, building...`);
    }

    // Ensure bin dir exists
    const binDir = path.join(os.homedir(), '.nuvin', 'bin');
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true });
    }

    const compileResult = spawnSync('swiftc', ['-O', '-o', axHelperBin, axHelperSrc, '-framework', 'ApplicationServices', '-framework', 'AppKit'], {
      stdio: 'pipe',
      encoding: 'utf8',
      timeout: 120000,
    });

    if (compileResult.status === 0) {
      console.log(`${INDENT}${PASS} ${chalk.bold('ax-helper')} — compiled successfully`);
    } else {
      console.log(`${INDENT}${FAIL} ${chalk.bold('ax-helper')} — compilation failed`);
      if (compileResult.stderr) {
        console.log(`${INDENT}     ${chalk.dim(compileResult.stderr.slice(0, 300))}`);
      }
      console.log(`${INDENT}     ${ARROW} Requires Xcode Command Line Tools: ${chalk.cyan('xcode-select --install')}`);
    }
  } else {
    console.log(`${INDENT}${PASS} ${chalk.bold('ax-helper')} — compiled Swift accessibility helper`);
  }

  // 3. screencapture
  const screencapturePath = which('screencapture');
  if (screencapturePath) {
    console.log(`${INDENT}${PASS} ${chalk.bold('screencapture')} — built-in macOS screenshot tool`);
  } else {
    // Shouldn't happen on macOS, but handle it gracefully
    console.log(`${INDENT}${FAIL} ${chalk.bold('screencapture')} — not found (unexpected on macOS)`);
  }

  // 4. /usr/bin/python3 (system Python with Quartz built in)
  const python3Path = which('/usr/bin/python3');
  if (python3Path) {
    console.log(`${INDENT}${PASS} ${chalk.bold('/usr/bin/python3')} — macOS system Python`);

    // 4a. Quartz module (should always be available in system Python)
    if (checkPythonQuartz()) {
      console.log(`${INDENT}${PASS} ${chalk.bold('Quartz framework')} — available`);
    } else {
      console.log(`${INDENT}${FAIL} ${chalk.bold('Quartz framework')} — not available (unexpected on macOS)`);
    }
  } else {
    console.log(`${INDENT}${FAIL} ${chalk.bold('/usr/bin/python3')} — not found (unexpected on macOS)`);
    console.log(`${INDENT}     ${ARROW} Scroll functionality requires macOS system Python`);
  }

  // 5. cliclick
  const cliclickPath = which('cliclick');
  if (cliclickPath) {
    console.log(`${INDENT}${PASS} ${chalk.bold('cliclick')} — found at ${cliclickPath}`);
  } else {
    console.log(`${INDENT}${FAIL} ${chalk.bold('cliclick')} — not found`);
    console.log('');
    console.log(`${INDENT}Installing cliclick via Homebrew...`);

    const installed = brewInstallCliclick();
    if (installed) {
      console.log(`${INDENT}${PASS} ${chalk.bold('cliclick')} — installed successfully`);
    } else {
      console.log(`${INDENT}${FAIL} ${chalk.bold('cliclick')} — installation failed`);
      console.log(`${INDENT}     ${ARROW} Try manually: ${chalk.cyan('brew install cliclick')}`);
    }
  }

  // 6 & 7. Permissions — can't auto-check, remind user
  console.log('');
  console.log(`${INDENT}${WARN} ${chalk.bold('Manual steps required:')}`);
  console.log(
    `${INDENT}${ARROW} System Settings ${chalk.dim('→')} Privacy & Security ${chalk.dim('→')} ${chalk.bold('Accessibility')}`,
  );
  console.log(`${INDENT}  Grant access to your terminal app (Terminal, iTerm2, etc.)`);
  console.log(
    `${INDENT}${ARROW} System Settings ${chalk.dim('→')} Privacy & Security ${chalk.dim('→')} ${chalk.bold('Screen Recording')}`,
  );
  console.log(`${INDENT}  Grant access to your terminal app`);

  console.log('');
  console.log(`${chalk.green('Setup complete!')} The computer tool is ready to use.`);
  console.log(`${INDENT}${chalk.dim('Run /setup computer-use --force to force rebuild ax-helper.')}`);
  console.log('');
  console.log(`${INDENT}${chalk.yellow('Note:')} The computer tool is experimental and requires ${chalk.bold('NUVIN_COMPUTER_USE=1')} to be set.`);
  console.log(`${INDENT}Example: ${chalk.cyan('NUVIN_COMPUTER_USE=1 nuvin')}`);
  console.log('');
}

// ─── registration ────────────────────────────────────────────────────────────

export function registerSetupCommand(registry: CommandRegistry) {
  registry.register({
    id: '/setup',
    type: 'function',
    description: 'Check and install prerequisites for nuvin tools',
    category: 'integration',
    async handler({ rawInput }) {
      const parts = rawInput.trim().split(/\s+/);
      const subcommand = parts[1]?.toLowerCase();

      if (subcommand === 'computer-use') {
        await runComputerUseSetup(rawInput);
        return;
      }

      // No subcommand or unknown subcommand — show usage
      console.log('');
      console.log(`${chalk.bold('Usage:')} /setup <tool> [options]`);
      console.log('');
      console.log('Available tools:');
      console.log(`  ${chalk.cyan('computer-use')}  — Check and install prerequisites for the computer use tool`);
      console.log('');
      console.log('Options:');
      console.log(`  ${chalk.cyan('--force', '-f')}    — Force rebuild ax-helper even if already compiled`);
      console.log('');
    },
  });
}
