# @nuvin/nuvin-cli

## 2.0.0-rc.17

### Patch Changes

- [`112d125`](https://github.com/marschhuynh/nuvin-space/commit/112d125fe6d2b01c087f9de69bb047b1e91b55a6) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Define a real `require` at the top of the bundled ESM CLI via `module.createRequire(import.meta.url)` so bundled CommonJS dependencies can resolve `require("process")` and other Node builtins instead of hitting the esbuild "Dynamic require of X is not supported" runtime shim.

## 2.0.0-rc.16

### Patch Changes

- [`07b6b70`](https://github.com/marschhuynh/nuvin-space/commit/07b6b70e8afb39588969e25b5871504ce851d499) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Republish the CLI with the updated core dependency so installed releases resolve the current `@nuvin/nuvin-core` public subpath exports correctly.

- Updated dependencies [[`4f6c3d6`](https://github.com/marschhuynh/nuvin-space/commit/4f6c3d6508ba4e32b1e6e8b225baf6f7bf2671dc)]:
  - @nuvin/nuvin-core@2.1.0-rc.7

## 2.0.0-rc.15

### Major Changes

- [#214](https://github.com/marschhuynh/nuvin-cli/pull/214) [`8da3b87`](https://github.com/marschhuynh/nuvin-space/commit/8da3b8734f3331c55194ffc96245c0f46c1df730) Thanks [@marschhuynh](https://github.com/marschhuynh)! - Rename the published CLI package back to `@nuvin/nuvin-cli` to align the workspace, release workflow, and npm distribution name for the v2 release line.
