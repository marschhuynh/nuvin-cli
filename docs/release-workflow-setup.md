# Release Workflow Setup

## Overview

This repository uses a single unified workflow (`publish.yml`) for all npm publishing, supporting both RC (release candidate) and stable releases.

## Workflow

### **Publish to NPM** (`publish.yml`)

Single workflow that handles all publishing scenarios:

| Trigger | Mode | Description |
|---------|------|-------------|
| Push to `main` | RC | Auto-publishes RC if changesets exist |
| Manual dispatch | RC | Manually trigger RC release |
| Manual dispatch | Stable | Promote RC to stable (requires approval) |

## Why Single Workflow?

NPM trusted publishing only allows **one workflow file per package**. By consolidating all publishing logic into `publish.yml`, we configure trusted publishing once and use it for all release types.

## Setup Required

### 1. Production Environment (for stable releases)

1. Go to repository → **Settings** → **Environments**
2. Click **New environment** → Name: `production`
3. Configure protection rules:
   - ✅ **Required reviewers** - Add yourself or team members
4. Click **Save protection rules**

### 2. NPM Trusted Publishing

1. Go to [npmjs.com](https://www.npmjs.com/) → Package → Settings → Publishing Access
2. Add trusted publisher:
   - **Workflow filename**: `publish.yml`
   - **Repository**: `your-org/your-repo`
   - **Environment**: `production`

## Usage

### Creating RC Releases (Automatic)

1. Create a changeset:
   ```bash
   pnpm changeset
   ```

2. Commit and push to feature branch

3. Create PR → merge to main

4. `publish.yml` automatically:
   - Detects changesets
   - Creates RC version PR
   - After PR merge, publishes RC to npm with `rc` tag

### Creating RC Releases (Manual)

1. Go to **Actions** → **Publish to NPM**
2. Click **Run workflow**
3. Select **Mode: rc**
4. Click **Run workflow**

### Promoting RC to Stable

1. Go to **Actions** → **Publish to NPM**
2. Click **Run workflow**
3. Select **Mode: stable**
4. Enter **RC tag**: `@nuvin/nuvin-cli@1.35.3-rc.1`
5. Click **Run workflow**
6. Wait for approval (production environment)
7. Approve to publish stable release

## Flow Diagram

```
[Feature Branch]
      ↓
   [PR to main]
      ↓
   [Merge] → publish.yml (push trigger)
      ↓
  [Has changesets?]
      ↓ Yes
  [RC PR Created] → 1.35.3-rc.1
      ↓
   [Merge RC PR] → publish.yml (push trigger)
      ↓
  [RC Published to npm@rc]
      ↓
[Manual: Run publish.yml, mode=stable]
      ↓
  [Waits for approval (production env)]
      ↓
  [Approved] → Exit pre-mode, version, publish
      ↓
  [1.35.4 on npm@latest]
```

## NPM Tags

| Tag | Description | Example |
|-----|-------------|---------|
| `rc` | Release candidates | `1.35.3-rc.1` |
| `latest` | Stable releases | `1.35.4` |

Install commands:
```bash
# Stable (default)
npm install @nuvin/nuvin-cli

# RC
npm install @nuvin/nuvin-cli@rc

# Specific version
npm install @nuvin/nuvin-cli@1.35.3-rc.1
```

