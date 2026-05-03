#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const rootDir = new URL("..", import.meta.url).pathname;
const packDir = mkdtempSync(join(tmpdir(), "nuvin-release-pack-"));
const installDir = mkdtempSync(join(tmpdir(), "nuvin-release-install-"));
const npmCacheDir = mkdtempSync(join(tmpdir(), "nuvin-release-npm-cache-"));
const privateWorkspacePackages = [
  "@nuvin/config",
  "@nuvin/ink-input",
  "@nuvin/ink-text-input",
  "@nuvin/ink-virtualized-list",
];
const allowedNuvinRuntimePackages = new Set(["@nuvin/nuvin-core", "@nuvin/ink"]);
const allowedInstalledNuvinPackages = new Set(["ink", "nuvin-cli", "nuvin-core"]);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: options.cwd ?? rootDir,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    stdio: options.stdio ?? ["ignore", "pipe", "inherit"],
  });
}

function fail(message) {
  console.error(`release installability check failed: ${message}`);
  process.exit(1);
}

function packPackage(packageName) {
  const before = new Set(readdirSync(packDir));
  run("pnpm", ["--filter", packageName, "pack", "--pack-destination", packDir], {
    stdio: "ignore",
  });
  const created = readdirSync(packDir).filter(
    (entry) => !before.has(entry) && entry.endsWith(".tgz"),
  );
  if (created.length !== 1) {
    fail(`could not determine packed tarball for ${packageName}`);
  }
  return join(packDir, created[0]);
}

function extractJson(tarballPath, pathInPackage) {
  const output = run("tar", ["-xOf", tarballPath, `package/${pathInPackage}`]);
  return JSON.parse(output);
}

function extractText(tarballPath, pathInPackage) {
  return run("tar", ["-xOf", tarballPath, `package/${pathInPackage}`]);
}

const cliTarball = packPackage("@nuvin/nuvin-cli");
const coreTarball = packPackage("@nuvin/nuvin-core");

if (!existsSync(cliTarball)) fail(`CLI tarball does not exist: ${cliTarball}`);
if (!existsSync(coreTarball)) fail(`core tarball does not exist: ${coreTarball}`);

const cliManifest = extractJson(cliTarball, "package.json");
const coreManifest = extractJson(coreTarball, "package.json");

if (cliManifest.private) fail("@nuvin/nuvin-cli is still private");
if (coreManifest.private) fail("@nuvin/nuvin-core is still private");
if (cliManifest.publishConfig?.access !== "public")
  fail("@nuvin/nuvin-cli publishConfig.access is not public");
if (coreManifest.publishConfig?.access !== "public")
  fail("@nuvin/nuvin-core publishConfig.access is not public");
if (!cliManifest.bin?.nuvin) fail("@nuvin/nuvin-cli does not expose the nuvin binary");

const runtimeDependencyGroups = [
  ["dependencies", cliManifest.dependencies ?? {}],
  ["optionalDependencies", cliManifest.optionalDependencies ?? {}],
  ["peerDependencies", cliManifest.peerDependencies ?? {}],
];

for (const [groupName, dependencies] of runtimeDependencyGroups) {
  for (const packageName of privateWorkspacePackages) {
    if (dependencies[packageName]) {
      fail(`${packageName} appears in CLI ${groupName}`);
    }
  }

  for (const [packageName, versionRange] of Object.entries(dependencies)) {
    if (String(versionRange).startsWith("workspace:")) {
      fail(`${packageName} uses workspace protocol in packed CLI ${groupName}`);
    }
    if (packageName.startsWith("@nuvin/") && !allowedNuvinRuntimePackages.has(packageName)) {
      fail(`${packageName} is not an allowed @nuvin runtime dependency`);
    }
  }
}

const cliEntry = extractText(cliTarball, "dist/index.js");
for (const packageName of privateWorkspacePackages) {
  if (cliEntry.includes(packageName)) {
    fail(`bundled CLI entry still references ${packageName}`);
  }
}

run("npm", ["init", "-y"], { cwd: installDir, stdio: "ignore" });
run("npm", ["install", "--omit=dev", "--cache", npmCacheDir, cliTarball], {
  cwd: installDir,
  stdio: "ignore",
});

const installedNuvinDir = join(installDir, "node_modules", "@nuvin");
if (!existsSync(installedNuvinDir)) {
  fail("clean install did not create node_modules/@nuvin");
}

const installedNuvinPackages = readdirSync(installedNuvinDir).filter(
  (entry) => !entry.startsWith("."),
);
for (const packageName of installedNuvinPackages) {
  if (!allowedInstalledNuvinPackages.has(packageName)) {
    fail(`clean install included unexpected @nuvin/${packageName}`);
  }
}

for (const packageName of allowedInstalledNuvinPackages) {
  if (!installedNuvinPackages.includes(packageName)) {
    fail(`clean install is missing expected @nuvin/${packageName}`);
  }
}

console.log("release installability check passed");
console.log(
  `CLI runtime @nuvin deps: ${Object.keys(cliManifest.dependencies ?? {})
    .filter((name) => name.startsWith("@nuvin/"))
    .join(", ")}`,
);
console.log(
  `Clean install @nuvin packages: ${installedNuvinPackages.map((name) => `@nuvin/${name}`).join(", ")}`,
);
