#!/usr/bin/env node
import { execSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist");

console.log("Building cli...");

if (process.env.SKIP_TYPE_CHECK !== "1") {
  try {
    execSync("npx tsc -p tsconfig.build.json --noEmit", { cwd: rootDir, stdio: "inherit" });
    console.log("TypeScript type check passed");
  } catch {
    console.error("TypeScript type check failed");
    process.exit(1);
  }
} else {
  console.log("Skipping TypeScript type check (SKIP_TYPE_CHECK=1)");
}

try {
  execSync("npx tsup", { cwd: rootDir, stdio: "inherit" });
  console.log("TypeScript compilation completed");
} catch {
  console.error("TypeScript compilation failed");
  process.exit(1);
}

try {
  execSync("node scripts/generate-version.js", { cwd: rootDir, stdio: "inherit" });
  console.log("Version generation completed");
} catch {
  console.error("Version generation failed");
  process.exit(1);
}

try {
  copyFileSync(join(rootDir, "README.md"), join(distDir, "README.md"));
  console.log("README.md copied to dist");
} catch (error) {
  console.error("README.md copy failed:", error.message);
  process.exit(1);
}

if (!existsSync(distDir)) {
  console.error("Dist directory not found");
  process.exit(1);
}

function listJavaScriptFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return listJavaScriptFiles(entryPath);
    }
    return entry.isFile() && entry.name.endsWith(".js") ? [entryPath] : [];
  });
}

const { default: obfuscator } = await import("javascript-obfuscator");

for (const filePath of listJavaScriptFiles(distDir)) {
  const code = readFileSync(filePath, "utf8");
  const shebang = code.startsWith("#!") ? `${code.split("\n")[0]}\n` : "";
  const codeWithoutShebang = shebang ? code.slice(shebang.length) : code;

  try {
    const result = obfuscator.obfuscate(codeWithoutShebang, {
      compact: true,
      controlFlowFlattening: false,
      deadCodeInjection: false,
      debugProtection: false,
      debugProtectionInterval: 0,
      disableConsoleOutput: false,
      identifierNamesGenerator: "hexadecimal",
      log: false,
      numbersToExpressions: false,
      renameGlobals: false,
      selfDefending: false,
      simplify: true,
      splitStrings: false,
      stringArray: true,
      stringArrayCallsTransform: true,
      stringArrayEncoding: ["base64"],
      stringArrayIndexShift: true,
      stringArrayRotate: true,
      stringArrayShuffle: true,
      stringArrayWrappersCount: 2,
      stringArrayWrappersChainedCalls: true,
      stringArrayWrappersParametersMaxCount: 4,
      stringArrayWrappersType: "function",
      stringArrayThreshold: 0.75,
      target: "node",
      transformObjectKeys: false,
      unicodeEscapeSequence: false,
    });

    writeFileSync(filePath, shebang + result.getObfuscatedCode(), "utf8");
  } catch (error) {
    console.error(`${filePath}: ${error.message}`);
    process.exit(1);
  }
}

console.log("Build complete!");
