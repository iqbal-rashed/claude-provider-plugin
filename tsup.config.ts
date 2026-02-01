import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: false,
  clean: true,
  minify: true,
  splitting: false,
  sourcemap: false,
  target: "node18",
  outDir: "tools",
  noExternal: [/(.*)/], // Bundle all dependencies
  banner: {
    js: "#!/usr/bin/env node",
  },
});
