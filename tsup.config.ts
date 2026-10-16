import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  format: ["esm"],
  dts: true,
  clean: true,
  target: "node22",
  outDir: "dist",
  external: ["@opencode/plugin", "effect"],
});
