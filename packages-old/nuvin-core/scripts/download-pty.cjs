#!/usr/bin/env node

/**
 * Download node-pty prebuilt binaries for different platforms
 *
 * Usage:
 *   node scripts/download-pty.cjs           # Download for current platform only (default)
 *   node scripts/download-pty.cjs --all     # Download for all platforms
 *   DOWNLOAD_ALL_PLATFORMS=true node scripts/download-pty.cjs  # Download for all platforms
 *
 * NPM Scripts:
 *   pnpm postinstall                        # Automatically downloads for current platform
 *   pnpm download-pty-all                   # Downloads for all platforms
 *
 * Supported platforms:
 *   - darwin-x64, darwin-arm64
 *   - linux-x64, linux-arm64
 *   - linuxmusl-x64, linuxmusl-arm64
 *   - win32-x64
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { createWriteStream } = require('fs');
const { createGunzip } = require('zlib');
const { spawn } = require('child_process');

const VERSION = '0.13.1';
const REPO = 'homebridge/node-pty-prebuilt-multiarch';

// Detect if running from published package or development
// The loader always looks in dist/prebuilds
// In published packages, dist/ exists so we download there
// During development, we download to prebuilds/ and the build script copies to dist/
const packageRoot = path.join(__dirname, '..');
const hasDistFolder = fs.existsSync(path.join(packageRoot, 'dist'));
const PREBUILDS_DIR = hasDistFolder
  ? path.join(packageRoot, 'dist', 'prebuilds')  // Published: download to dist/prebuilds (used by loader)
  : path.join(packageRoot, 'prebuilds');          // Development: download to prebuilds (build copies to dist)

// Define all platform/architecture combinations to download
// Set DOWNLOAD_ALL_PLATFORMS=true to download for all platforms
// Otherwise, only downloads for current platform
const ALL_PLATFORMS = [
  { platform: 'darwin', arch: 'x64' },
  { platform: 'darwin', arch: 'arm64' },
  { platform: 'linux', arch: 'x64' },
  { platform: 'linux', arch: 'arm64' },
  { platform: 'linuxmusl', arch: 'x64' },
  { platform: 'linuxmusl', arch: 'arm64' },
  { platform: 'win32', arch: 'x64' },
  // Note: win32-ia32 and win32-arm64 are not available for modern Node.js versions
];

function detectPlatform() {
  const platform = process.platform;
  const arch = process.arch;

  let platformName = platform;
  if (platform === 'linux') {
    try {
      fs.accessSync('/etc/alpine-release', fs.constants.F_OK);
      platformName = 'linuxmusl';
    } catch {
      platformName = 'linux';
    }
  }

  return { platform: platformName, arch };
}

function buildDownloadInfo(platform, arch) {
  const nodeAbi = `node-v${process.versions.modules}`;
  const filename = `node-pty-prebuilt-multiarch-v${VERSION}-${nodeAbi}-${platform}-${arch}.tar.gz`;
  const url = `https://github.com/${REPO}/releases/download/v${VERSION}/${filename}`;

  return { filename, url, platform, arch, nodeAbi };
}

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, { followRedirect: true }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        return download(response.headers.location, dest).then(resolve).catch(reject);
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
        fs.unlink(dest, () => {});
        reject(err);
      });
    }).on('error', reject);
  });
}

async function extractTarGz(tarGzPath, destDir) {
  return new Promise((resolve, reject) => {
    const tar = spawn('tar', ['-xzf', tarGzPath, '-C', destDir, '--strip-components=2', 'build/Release'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const extractedFiles = [];

    tar.on('error', (err) => {
      if (err.code === 'ENOENT') {
        reject(new Error('tar command not found. Please install tar or GNU tar.'));
      } else {
        reject(err);
      }
    });

    tar.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`tar extraction failed with code ${code}`));
      } else {
        const ptyPath = path.join(destDir, 'pty.node');
        const spawnHelperPath = path.join(destDir, 'spawn-helper');

        if (fs.existsSync(ptyPath)) {
          fs.chmodSync(ptyPath, 0o755);
          extractedFiles.push(ptyPath);
        }
        if (fs.existsSync(spawnHelperPath)) {
          fs.chmodSync(spawnHelperPath, 0o755);
          extractedFiles.push(spawnHelperPath);
        }

        resolve(extractedFiles);
      }
    });
  });
}

async function downloadForPlatform(platform, arch) {
  const { filename, url, nodeAbi } = buildDownloadInfo(platform, arch);
  const targetDir = path.join(PREBUILDS_DIR, `${platform}-${arch}`);
  const tarGzPath = path.join(PREBUILDS_DIR, filename);

  const binaryPath = path.join(targetDir, 'pty.node');
  const spawnHelperPath = path.join(targetDir, 'spawn-helper');

  if (fs.existsSync(binaryPath)) {
    console.log(`✓ Prebuild already exists: ${platform}-${arch}`);
    // Ensure execute permissions are set (they may be lost during npm pack/publish)
    try {
      fs.chmodSync(binaryPath, 0o755);
      if (fs.existsSync(spawnHelperPath)) {
        fs.chmodSync(spawnHelperPath, 0o755);
      }
      console.log(`  Execute permissions verified`);
    } catch (err) {
      console.warn(`  ⚠ Could not set execute permissions: ${err.message}`);
    }
    return { success: true, skipped: true };
  }

  console.log(`\nDownloading node-pty prebuild for ${platform}-${arch} (${nodeAbi})...`);
  console.log(`URL: ${url}`);

  fs.mkdirSync(targetDir, { recursive: true });

  try {
    await download(url, tarGzPath);
    console.log(`✓ Downloaded to ${tarGzPath}`);

    const extractedFiles = await extractTarGz(tarGzPath, targetDir);
    console.log(`✓ Extracted to ${targetDir}`);
    console.log(`  Files: ${extractedFiles.join(', ')}`);

    fs.unlinkSync(tarGzPath);

    if (fs.existsSync(binaryPath)) {
      console.log(`✓ Binary installed: ${binaryPath}`);
      return { success: true, skipped: false };
    } else {
      throw new Error(`Binary not found after extraction: ${binaryPath}`);
    }
  } catch (error) {
    console.error(`✗ Failed to download prebuild for ${platform}-${arch}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  const downloadAll = process.env.DOWNLOAD_ALL_PLATFORMS === 'true' || process.argv.includes('--all');

  if (downloadAll) {
    console.log('Downloading prebuilds for all platforms...\n');

    const results = [];
    for (const { platform, arch } of ALL_PLATFORMS) {
      const result = await downloadForPlatform(platform, arch);
      results.push({ platform, arch, ...result });
    }

    console.log('\n=== Download Summary ===');
    const successful = results.filter(r => r.success && !r.skipped);
    const skipped = results.filter(r => r.success && r.skipped);
    const failed = results.filter(r => !r.success);

    console.log(`✓ Downloaded: ${successful.length}`);
    console.log(`- Skipped (already exists): ${skipped.length}`);
    if (failed.length > 0) {
      console.log(`✗ Failed: ${failed.length}`);
      failed.forEach(({ platform, arch, error }) => {
        console.log(`  - ${platform}-${arch}: ${error}`);
      });
    }

    // Exit with error if any downloads failed
    if (failed.length > 0) {
      process.exit(1);
    }
  } else {
    // Download only for current platform
    const { platform, arch } = detectPlatform();
    console.log(`Downloading prebuild for current platform: ${platform}-${arch}\n`);

    const result = await downloadForPlatform(platform, arch);
    if (!result.success) {
      console.error('Falling back to npm package installation...');
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
