# Changeset Instructions

## Local Changeset Guidelines

1. Create a new file in `.changeset/` with a short, unique name.
2. Frontmatter must list package name(s) and bump type (patch/minor/major), e.g.:

```md
---
"@nuvin/nuvin-cli": patch
"@nuvin/nuvin-core": minor
---
```

3. Message should be a compact, single sentence (imperative), e.g. `Refresh LSP diagnostics after file edits.`
4. Commit with conventional commits (e.g. `fix: ...`, `feat: ...`, `chore: ...`).
