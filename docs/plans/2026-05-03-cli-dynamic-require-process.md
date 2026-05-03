# CLI ESM bundle dynamic require issue

## Context

The published CLI bundle failed at runtime with:

```txt
Dynamic require of "process" is not supported
```

The source code does not use runtime dynamic `import()` for the CLI app itself. The issue comes from bundled CommonJS compatibility code in the ESM CLI bundle. A bundled dependency path calls `require("process")`; in ESM output, esbuild's fallback `__require` shim throws when no real `require` exists.

The error string was difficult to find in the built output because `javascript-obfuscator` encodes string literals.

## Current fix

A Node `createRequire` banner was added to the CLI tsup config:

```ts
banner: {
  js: "import { createRequire as __nuvinCreateRequire } from 'module'; const require = __nuvinCreateRequire(import.meta.url);",
},
```

This defines a real `require` inside the ESM bundle so bundled CommonJS code can resolve Node builtins like `process`.

Verified after build:

```js
import{createRequire as _0x587070}from'module';const require=_0x587070(import.meta.url);
```

`node packages/cli/dist/index.js --help` no longer fails with the dynamic-require error. It now reaches normal config validation.

## Trade-offs

Pros:

- Minimal, targeted release fix.
- Keeps the CLI as ESM output.
- Avoids patching or replacing dependencies before release.
- Works for a Node-only CLI runtime.

Cons:

- Adds a CommonJS compatibility bridge into an ESM bundle.
- Makes the bundle explicitly Node-only through `node:module` / `module` `createRequire` behavior.
- Can mask which dependency is producing the `require("process")` call.
- May allow additional runtime `require()` resolution attempts if bundled code dynamically requires optional packages.
- Obfuscation still makes root-cause tracing harder.

## Follow-up options

When revisiting this, investigate alternatives:

1. Identify the exact bundled dependency/path that emits `require("process")`.
2. Check whether upgrading, replacing, or externalizing that dependency removes the need for the banner.
3. Consider whether CLI should externalize more Node builtins like the core package does.
4. Consider whether CJS output is a better fit for the CLI package, though this has higher release blast radius.
5. Re-evaluate `javascript-obfuscator` because it makes runtime issue diagnosis harder.

## Related files

- `packages/cli/tsup.config.ts` — current banner fix.
- `packages/cli/scripts/build.js` — runs tsup and then obfuscates built JS.
- `packages/agent/tsup.config.ts` — core package externalizes Node builtins and did not need the same fix.
