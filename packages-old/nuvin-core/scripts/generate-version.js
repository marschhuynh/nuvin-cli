#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getPackageVersion() {
  const packageJsonPath = join(__dirname, '..', 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version || 'unknown';
}

function getCommitHash() {
  try {
    const hash = execSync('git rev-parse HEAD', {
      encoding: 'utf8',
      cwd: join(__dirname, '..'),
      timeout: 5000,
    }).trim();
    return hash.substring(0, 7);
  } catch {
    return 'unknown';
  }
}

function generateVersionInfo() {
  const version = getPackageVersion();
  const commit = getCommitHash();
  return JSON.stringify({ version, commit }, null, 2);
}

function main() {
  const versionInfo = generateVersionInfo();
  const versionFilePath = join(__dirname, '..', 'dist', 'VERSION');
  
  try {
    writeFileSync(versionFilePath, versionInfo, 'utf8');
    console.log(`Version file created: ${versionFilePath}`);
  } catch (error) {
    console.error('Failed to create version file:', error);
    process.exit(1);
  }
}

main();