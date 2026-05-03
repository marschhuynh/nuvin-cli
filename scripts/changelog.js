#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PRELEASE_VERSION = process.argv[2];

if (!PRELEASE_VERSION) {
  console.error("Usage: node changelog.js <prerelease-version>");
  console.error("Example: node changelog.js 1.34.0-rc.0");
  process.exit(1);
}

async function main() {
  console.log(`Generating changelog for pre-release: ${PRELEASE_VERSION}`);

  const changelogPath = join(__dirname, "..", "CHANGELOG.md");

  const existingChangelog = existsSync(changelogPath)
    ? readFileSync(changelogPath, "utf-8")
    : "# Changelog\n\n";

  const releaseTitle = `## ${PRELEASE_VERSION}`;

  if (existingChangelog.includes(releaseTitle)) {
    console.log("Changelog entry already exists for this version.");
    return;
  }

  try {
    const changesets = execSync("pnpm --silent changeset status --output JSON", {
      encoding: "utf-8",
      cwd: join(__dirname, ".."),
    }).trim();

    if (!changesets) {
      console.log("No unreleased changesets found.");
      return;
    }

    const parsedChangesets = JSON.parse(changesets);

    if (parsedChangesets.releases.length === 0) {
      console.log("No releases in changesets.");
      return;
    }

    const changes = parsedChangesets.releases
      .map((release) => {
        const changesetsForRelease = parsedChangesets.changesets.filter((cs) =>
          cs.releases.some((r) => r.name === release.name),
        );

        const summaries = changesetsForRelease
          .map((cs) => cs.summary)
          .filter(Boolean)
          .join("\n");

        if (!summaries) return null;

        return `### ${release.name}@${release.newVersion}\n\n${summaries}`;
      })
      .filter(Boolean)
      .join("\n\n");

    if (!changes) {
      console.log("No changes to document.");
      return;
    }

    const newEntry = `\n## ${PRELEASE_VERSION}\n\n${changes}\n\n---\n\n${existingChangelog}`;

    writeFileSync(changelogPath, newEntry);
    console.log(`Changelog updated: ${changelogPath}`);
  } catch (error) {
    console.error("Failed to generate changelog:", error.message);
    process.exit(1);
  }
}

main();
