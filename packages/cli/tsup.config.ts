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
