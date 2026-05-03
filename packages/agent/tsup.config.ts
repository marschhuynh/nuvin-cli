import { defineConfig } from "tsup";

export default defineConfig({
  tsconfig: "tsconfig.build.json",
  entry: {
    "agent/index": "src/agent/index.ts",
    "formats/index": "src/formats/index.ts",
    "models/index": "src/models/index.ts",
    "shared/index": "src/shared/index.ts",
    "tools/index": "src/tools/index.ts",
  },
  format: ["esm"],
  dts: true,
  minify: false,
  target: "node18",
  splitting: true,
  clean: true,
  outDir: "dist",
  external: [
    "node:*",
    "fs",
    "path",
    "os",
    "crypto",
    "child_process",
    "stream",
    "util",
    "events",
    "url",
    "buffer",
    "process",
    "module",
  ],
  noExternal: [],
  esbuildOptions(options) {
    options.define = {
      ...options.define,
      "process.env.NODE_ENV": '"production"',
    };
  },
});
