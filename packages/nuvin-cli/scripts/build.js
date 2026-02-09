#!/usr/bin/env node
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = join(__filename, '..');
const rootDir = join(__dirname, '..');
const distDir = join(rootDir, 'dist');

console.log('🚀 Building nuvin-cli...');

if (process.env.SKIP_TYPE_CHECK !== '1') {
  try {
    execSync('npx tsc --noEmit', { cwd: rootDir, stdio: 'inherit' });
    console.log('✓ TypeScript type check passed');
  } catch (error) {
    console.error('✗ TypeScript type check failed');
    process.exit(1);
  }
} else {
  console.log('⏭ Skipping TypeScript type check (SKIP_TYPE_CHECK=1)');
}

try {
  execSync('npx tsup', { cwd: rootDir, stdio: 'inherit' });
  console.log('✓ TypeScript compilation completed');
} catch (error) {
  console.error('✗ TypeScript compilation failed');
  process.exit(1);
}

try {
  execSync('node scripts/generate-version.js', { cwd: rootDir, stdio: 'inherit' });
  console.log('✓ Version generation completed');
} catch (error) {
  console.error('✗ Version generation failed');
  process.exit(1);
}

try {
  const readmeSrc = join(rootDir, 'README.md');
  const readmeDest = join(distDir, 'README.md');
  copyFileSync(readmeSrc, readmeDest);
  console.log('✓ README.md copied to dist');
} catch (error) {
  console.error('✗ README.md copy failed:', error.message);
  process.exit(1);
}

// Copy builtin-agents markdown files
try {
  const { mkdirSync } = await import('fs');
  const builtinAgentsDir = join(rootDir, 'source', 'builtin-agents');
  const builtinAgentsDestDir = join(distDir, 'builtin-agents');
  
  mkdirSync(builtinAgentsDestDir, { recursive: true });
  
  const mdFiles = readdirSync(builtinAgentsDir).filter(f => f.endsWith('.md'));
  for (const file of mdFiles) {
    copyFileSync(join(builtinAgentsDir, file), join(builtinAgentsDestDir, file));
  }
  console.log(`✓ Copied ${mdFiles.length} builtin-agents markdown files to dist`);
} catch (error) {
  console.error('✗ Builtin-agents copy failed:', error.message);
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
