#!/usr/bin/env node
import { execSync } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const distDir = join(__dirname, '../dist');

console.log('🚀 Building nuvin-core...');

try {
  execSync('npx tsc --noEmit', { cwd: join(__dirname, '..'), stdio: 'inherit' });
  console.log('✓ TypeScript type check passed');
} catch (error) {
  console.error('✗ TypeScript type check failed');
  process.exit(1);
}

try {
  execSync('npx tsup', { cwd: join(__dirname, '..'), stdio: 'inherit' });
  console.log('✓ TypeScript compilation completed');
} catch (error) {
  console.error('✗ TypeScript compilation failed');
  process.exit(1);
}

// Copy Swift source files into dist so they're available in published package
try {
  const axHelperDistDir = join(distDir, 'tools', 'computer', 'ax-helper');
  if (!existsSync(axHelperDistDir)) {
    mkdirSync(axHelperDistDir, { recursive: true });
  }
  const axHelperSrc = join(__dirname, '..', 'src', 'tools', 'computer', 'ax-helper', 'main.swift');
  copyFileSync(axHelperSrc, join(axHelperDistDir, 'main.swift'));
  console.log('✓ Copied ax-helper/main.swift to dist');
} catch (error) {
  console.error('✗ Failed to copy ax-helper source:', error.message);
  process.exit(1);
}

try {
  execSync('node scripts/generate-version.js', { cwd: join(__dirname, '..'), stdio: 'inherit' });
  console.log('✓ Version generation completed');
} catch (error) {
  console.error('✗ Version generation failed');
  process.exit(1);
}

if (!existsSync(distDir)) {
  console.error('✗ Dist directory not found');
  process.exit(1);
}

const { default: obfuscator } = await import('javascript-obfuscator');

const files = readdirSync(distDir).filter(f => f.endsWith('.js'));

for (const file of files) {
  const filePath = join(distDir, file);
  const code = readFileSync(filePath, 'utf8');

  const shebang = code.startsWith('#!') ? code.split('\n')[0] + '\n' : '';
  const codeWithoutShebang = shebang ? code.slice(shebang.length) : code;

  try {
    const result = obfuscator.obfuscate(codeWithoutShebang, {
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      debugProtection: false,
      debugProtectionInterval: 0,
      disableConsoleOutput: false,
      identifierNamesGenerator: 'hexadecimal',
      log: false,
      numbersToExpressions: false,
      renameGlobals: false,
      selfDefending: false,
      simplify: true,
      splitStrings: false,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayEncoding: ['base64'],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 2,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 4,
      stringArrayWrappersType: 'function',
      stringArrayThreshold: 0.75,
      target: 'node',
      transformObjectKeys: false,
      unicodeEscapeSequence: false
    });

    writeFileSync(filePath, shebang + result.getObfuscatedCode(), 'utf8');
  } catch (error) {
    console.error(`✗ ${file}: ${error.message}`);
    process.exit(1);
  }
}

console.log('🎉 Build complete!');
