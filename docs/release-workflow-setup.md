# Release Workflow Setup

## Overview

This repository uses a multi-stage release workflow with RC (release candidate) versions and manual promotion to stable.

## Workflows

1. **RC Release** (`release.yml`) - Automated
   - Triggers on push to main when changesets exist
   - Creates RC version PR (e.g., `1.35.3-rc.1`)
   - Publishes RC to npm with `rc` tag after PR merge

2. **Promote to Stable** (`release-promote.yml`) - Manual with approval
   - Stage 1: Prepare Release (automated)
     - Exit pre-release mode
     - Version packages
     - Generate changelog
     - Upload artifacts for review
   - Stage 2: Publish Stable (requires approval)
     - Commit version changes to main
     - Publish to npm with `latest` tag
     - Push git tags

3. **Publish Stable** (`publish-stable.yml`) - Deprecated
   - No longer used with multi-stage workflow

## Setup Required: Production Environment

To enable manual approval for stable releases, you need to configure a GitHub environment:

### Steps:

1. Go to your repository → **Settings** → **Environments**
2. Click **New environment**
3. Name it: `production`
4. Configure protection rules:
   - ✅ **Required reviewers** - Add yourself or team members
   - ⏱️ **Wait timer** (optional) - Add delay if needed
5. Click **Save protection rules**

### What this does:

- The `publish-stable` job will pause after `prepare-release` completes
- GitHub will notify required reviewers
- Reviewers can see the changelog and version changes in artifacts
- Approval required before publishing to npm

## Usage

### Creating RC Releases

1. Create a changeset:
   ```bash
   pnpm changeset
   ```

2. Commit and push to feature branch

3. Create PR → merge to main

4. Workflow automatically:
   - Creates RC version PR
   - After PR merge, publishes RC to npm

### Promoting RC to Stable

1. Go to **Actions** → **Promote Pre-Release**

2. Click **Run workflow**

3. Enter RC tag (e.g., `@nuvin/nuvin-cli@1.35.3-rc.1`)

4. Workflow runs Stage 1 (Prepare Release):
   - Exits pre-release mode
   - Versions to stable (e.g., `1.35.4`)
   - Generates changelog
   - Uploads artifacts

5. Review artifacts:
   - Check `package.json` versions
   - Review `CHANGELOG.md`
   - Verify `.changeset/pre.json` removed

6. Approve **Publish Stable Release** job (if satisfied)

7. Workflow runs Stage 2 (Publish):
   - Commits changes to main
   - Publishes to npm
   - Pushes git tags

## Flow Diagram

```
[Feature Branch]
      ↓
   [PR to main]
      ↓
   [Merge] → release.yml
      ↓
  [RC PR Created] → 1.35.3-rc.1
      ↓
   [Merge RC PR] → release.yml
      ↓
  [RC Published to npm]
      ↓
[Manual: Run release-promote.yml]
      ↓
[Stage 1: Prepare] → Generate changelog, exit pre-mode
      ↓
  [Manual: Review & Approve]
      ↓
[Stage 2: Publish] → Commit to main, publish stable
      ↓
  [1.35.4 on npm@latest]
```

## NPM Tags

- `rc` - Release candidates (e.g., `1.35.3-rc.1`)
- `latest` - Stable releases (e.g., `1.35.4`)

Users installing with `npm install @nuvin/nuvin-cli` get `latest` by default.

To test RC versions:
```bash
npm install @nuvin/nuvin-cli@rc
# or specific version
npm install @nuvin/nuvin-cli@1.35.3-rc.1
```
