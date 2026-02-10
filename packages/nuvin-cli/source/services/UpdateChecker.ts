import https from 'node:https';
import { getVersion } from '../utils/version.js';

export interface VersionInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
}

export interface UpdateCheckOptions {
  onUpdateAvailable?: (versionInfo: VersionInfo) => void;
  onUpdateStarted?: () => void;
  onUpdateCompleted?: (success: boolean, message: string) => void;
  onError?: (error: Error) => void;
}

const NPM_REGISTRY = 'registry.npmjs.org';
const PACKAGE_NAME = '@nuvin/nuvin-cli';
const TIMEOUT_MS = 5000;

export namespace UpdateChecker {
  export async function checkForUpdate(options?: UpdateCheckOptions): Promise<VersionInfo> {
    const currentVersion = getVersion();

    try {
      const latestVersion = await fetchLatestVersion();

      if (latestVersion.includes('-')) {
        return {
          current: currentVersion,
          latest: latestVersion,
          hasUpdate: false,
        };
      }

      // RC → stable is always an update (e.g., 1.0.0-rc.1 → 1.0.0)
      const hasUpdate =
        (currentVersion.includes('-') && !latestVersion.includes('-')) ||
        compareVersions(currentVersion, latestVersion) < 0;
      const versionInfo: VersionInfo = {
        current: currentVersion,
        latest: latestVersion,
        hasUpdate,
      };

      if (hasUpdate && options?.onUpdateAvailable) {
        options.onUpdateAvailable(versionInfo);
      }

      return versionInfo;
    } catch (error) {
      if (options?.onError) {
        options.onError(error instanceof Error ? error : new Error(String(error)));
      }
      return {
        current: currentVersion,
        latest: currentVersion,
        hasUpdate: false,
      };
    }
  }

  function fetchLatestVersion(): Promise<string> {
    return new Promise((resolve, reject) => {
      const options = {
        hostname: NPM_REGISTRY,
        path: `/${encodeURIComponent(PACKAGE_NAME)}/latest`,
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
        timeout: TIMEOUT_MS,
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const json = JSON.parse(data);
              resolve(json.version);
            } else {
              reject(new Error(`HTTP ${res.statusCode}`));
            }
          } catch (error) {
            reject(error);
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.end();
    });
  }

  function compareVersions(v1: string, v2: string): number {
    const cleanVersion = (v: string) => v.replace(/^v/, '').split('-')[0];

    const parts1 = cleanVersion(v1).split('.').map(Number);
    const parts2 = cleanVersion(v2).split('.').map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const num1 = parts1[i] || 0;
      const num2 = parts2[i] || 0;

      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }

    return 0;
  }
}
