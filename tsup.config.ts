import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/cli.ts"],
    format: ["esm"],
    dts: false,
    clean: true,
    minify: true,
    splitting: false,
    sourcemap: false,
    target: "node18",
    outDir: "dist",
    banner: {
      js: "#!/usr/bin/env node",
    },
  },
]);
