import { exec, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import type { UpdateCheckOptions } from './UpdateChecker.js';

const execAsync = promisify(exec);

export interface UpdateResult {
  success: boolean;
  message: string;
  error?: string;
}

const PACKAGE_NAME = '@nuvin/nuvin-cli';

async function execWithTimeout(command: string, timeoutMs: number): Promise<string | null> {
  try {
    const { stdout } = await execAsync(command, { timeout: timeoutMs });
    return stdout.trim();
  } catch {
    return null;
  }
}

export namespace AutoUpdater {
  async function detectPackageManager(): Promise<'npm' | 'pnpm' | 'yarn'> {
    const executablePath = await execWithTimeout('which nuvin', 3000);

    if (executablePath) {
      const realPath = await execWithTimeout(`readlink "${executablePath}"`, 3000);

      if (realPath) {
        if (realPath.includes('/pnpm/') || realPath.includes('/.pnpm/')) {
          return 'pnpm';
        }
        if (realPath.includes('/yarn/') || realPath.includes('/.yarn/')) {
          return 'yarn';
        }
        if (realPath.includes('/npm/') || realPath.includes('node_modules')) {
          return 'npm';
        }
      } else {
        if (executablePath.includes('/pnpm/') || executablePath.includes('/.pnpm/')) {
          return 'pnpm';
        }
        if (executablePath.includes('/yarn/') || executablePath.includes('/.yarn/')) {
          return 'yarn';
        }
      }
    }

    const [npmList, pnpmList, yarnList] = await Promise.all([
      execWithTimeout('npm list -g @nuvin/nuvin-cli --depth=0 2>/dev/null', 5000),
      execWithTimeout('pnpm list -g @nuvin/nuvin-cli --depth=0 2>/dev/null', 5000),
      execWithTimeout('yarn global list --pattern @nuvin/nuvin-cli 2>/dev/null', 5000),
    ]);

    if (npmList?.includes('@nuvin/nuvin-cli')) {
      return 'npm';
    }
    if (pnpmList?.includes('@nuvin/nuvin-cli')) {
      return 'pnpm';
    }
    if (yarnList?.includes('@nuvin/nuvin-cli')) {
      return 'yarn';
    }

    return 'npm';
  }

  function getInstallCommand(packageManager: 'npm' | 'pnpm' | 'yarn', version?: string): string {
    const packageSpec = version ? `${PACKAGE_NAME}@${version}` : `${PACKAGE_NAME}@latest`;

    switch (packageManager) {
      case 'pnpm':
        return `pnpm add -g ${packageSpec}`;
      case 'yarn':
        return `yarn global add ${packageSpec}`;
      default:
        return `npm install -g ${packageSpec}`;
    }
  }

  export async function checkAndUpdate(options?: UpdateCheckOptions): Promise<boolean> {
    const { UpdateChecker } = await import('./UpdateChecker.js');

    try {
      const versionInfo = await UpdateChecker.checkForUpdate({
        onUpdateAvailable: options?.onUpdateAvailable,
        onError: options?.onError,
      });

      if (!versionInfo.hasUpdate) {
        return false;
      }

      if (options?.onUpdateStarted) {
        options.onUpdateStarted();
      }

      const packageManager = await detectPackageManager();
      const installCommand = getInstallCommand(packageManager, versionInfo.latest);

      const child = spawn('sh', ['-c', installCommand], {
        detached: true,
        stdio: 'ignore',
      });

      child.on('exit', (code) => {
        if (options?.onUpdateCompleted) {
          const success = code === 0;
          const message = success
            ? `Update to v${versionInfo.latest} completed successfully!`
            : 'Update failed. Please try manually.';
          options.onUpdateCompleted(success, message);
        }
      });

      child.on('error', (error) => {
        if (options?.onUpdateCompleted) {
          options.onUpdateCompleted(false, `Update failed: ${error.message}`);
        }
      });

      child.unref();

      return true;
    } catch (error) {
      if (options?.onError) {
        options.onError(error instanceof Error ? error : new Error(String(error)));
      }
      return false;
    }
  }
}
