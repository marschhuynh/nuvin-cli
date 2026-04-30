import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function getVersion(): string {
  try {
    const versionFilePath = join(__dirname, '../dist/VERSION');
    const versionInfo = JSON.parse(readFileSync(versionFilePath, 'utf8'));
    return versionInfo.version;
  } catch {
    try {
      const packageJsonPath = join(__dirname, '../../package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      return packageJson.version || 'unknown';
    } catch {
      return 'unknown';
    }
  }
}

export function getCommitHash(): string {
  try {
    const versionFilePath = join(__dirname, '../dist/VERSION');
    const versionInfo = JSON.parse(readFileSync(versionFilePath, 'utf8'));
    return versionInfo.commit;
  } catch {
    try {
      const hash = execSync('git rev-parse HEAD', {
        encoding: 'utf8',
        cwd: join(__dirname, '../../'),
        timeout: 5000,
      }).trim();
      return hash.substring(0, 7);
    } catch {
      return 'unknown';
    }
  }
}

export function getVersionInfo(): { version: string; commit: string } {
  return {
    version: getVersion(),
    commit: getCommitHash(),
  };
}
