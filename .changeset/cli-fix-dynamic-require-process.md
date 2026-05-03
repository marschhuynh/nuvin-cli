---
"@nuvin/nuvin-cli": patch
---

Define a real `require` at the top of the bundled ESM CLI via `module.createRequire(import.meta.url)` so bundled CommonJS dependencies can resolve `require("process")` and other Node builtins instead of hitting the esbuild "Dynamic require of X is not supported" runtime shim.
