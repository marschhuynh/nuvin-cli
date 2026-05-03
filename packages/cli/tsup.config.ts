import { defineConfig } from "tsup";

export default defineConfig({
  tsconfig: "tsconfig.build.json",
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  minify: true,
  target: "node18",
  outDir: "dist",
  external: ["@nuvin/nuvin-core", "@nuvin/ink"],
  noExternal: [
    "@nuvin/config",
    "@nuvin/ink-input",
    "@nuvin/ink-text-input",
    "@nuvin/ink-virtualized-list",
  ],
  esbuildOptions(options) {
    options.define = {
      ...options.define,
      "process.env.NODE_ENV": '"production"',
    };
    options.jsx = "automatic";
    options.jsxImportSource = "react";
    options.alias = {
      "#src": "./src",
    };
  },
  shims: true,
});
