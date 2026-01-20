# Release Workflow Setup

## Overview

This repository uses a multi-stage release workflow with RC (release candidate) versions and manual promotion to stable.

## Workflows

### 1. **RC Release** (`release.yml`) - Automated
   - Triggers on push to main when changesets exist
   - Calls `publish.yml` with mode=`rc`
   - Creates RC version PR (e.g., `1.35.3-rc.1`)
   - Publishes RC to npm with `rc` tag after PR merge

### 2. **Promote to Stable** (`release-promote.yml`) - Manual with approval
   - Calls `publish.yml` with mode=`stable`
   - Requires manual workflow dispatch with RC tag input
   - Uses `production` environment for manual approval
   - Exit pre-release mode, version to stable, generate changelog
   - Publish to npm with `latest` tag
   - Commit changes and push git tags

### 3. **Publish to NPM** (`publish.yml`) - Reusable workflow
   - **Single workflow for NPM trusted publishing**
   - Supports two modes: `rc` and `stable`
   - Called by both `release.yml` and `release-promote.yml`
   - Handles all npm publishing with provenance

## Why Single publish.yml?

NPM trusted publishing only allows **one workflow file per package**. By consolidating all publishing logic into `publish.yml`, we can configure trusted publishing once for this file and use it for both RC and stable releases.

## Setup Required: Production Environment

To enable manual approval for stable releases:

### Steps:

1. Go to your repository → **Settings** → **Environments**
2. Click **New environment**
3. Name it: `production`
4. Configure protection rules:
   - ✅ **Required reviewers** - Add yourself or team members
   - ⏱️ **Wait timer** (optional) - Add delay if needed
5. Click **Save protection rules**

### What this does:

- The stable publish job will pause before execution
- GitHub will notify required reviewers
- Reviewers can see the version changes
- Approval required before publishing to npm

## NPM Trusted Publishing Setup

Configure trusted publishing for `publish.yml` only:

1. Go to [npmjs.com](https://www.npmjs.com/) → Package → Settings → Publishing Access
2. Add trusted publisher:
   - **Workflow filename**: `publish.yml`
   - **Repository**: `your-org/your-repo`
   - **Environment**: `production` (for stable mode)

Note: Both RC and stable releases will use the same `publish.yml` workflow with different mode parameters.

## Usage

### Creating RC Releases

1. Create a changeset:
   ```bash
   pnpm changeset
   ```

2. Commit and push to feature branch

3. Create PR → merge to main

4. Workflow automatically:
   - `release.yml` detects changesets
   - Calls `publish.yml` with mode=`rc`
   - Creates RC version PR
   - After PR merge, publishes RC to npm

### Promoting RC to Stable

1. Go to **Actions** → **Promote Pre-Release to Stable**

2. Click **Run workflow**

3. Enter RC tag (e.g., `@nuvin/nuvin-cli@1.35.3-rc.1`)

4. Workflow runs and waits for approval (production environment)

5. Review the workflow logs to verify:
   - RC version exists on npm
   - Stable version will be correctly versioned
   - Tests pass

6. Approve the workflow execution

7. Workflow completes:
   - Exits pre-release mode
   - Versions to stable (e.g., `1.35.4`)
   - Generates changelog
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
  [Calls publish.yml (mode=rc)]
      ↓
  [RC PR Created] → 1.35.3-rc.1
      ↓
   [Merge RC PR] → release.yml
      ↓
  [Calls publish.yml (mode=rc)]
      ↓
  [RC Published to npm]
      ↓
[Manual: Run release-promote.yml]
      ↓
  [Calls publish.yml (mode=stable)]
      ↓
  [Waits for approval (production env)]
      ↓
  [Approved] → Exit pre-mode, version, publish
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

## Manual Workflow Execution

You can also manually trigger `publish.yml` directly:

### Manual RC Release:
```
Actions → Publish to NPM → Run workflow
Mode: rc
```

### Manual Stable Release:
```
Actions → Publish to NPM → Run workflow
Mode: stable
RC tag: @nuvin/nuvin-cli@1.35.3-rc.1
```

