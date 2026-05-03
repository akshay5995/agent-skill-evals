import { defineConfig } from "tsup";

export default defineConfig({
  entry: [
    "src/index.ts",
    "src/_shared.ts",
    "src/routing-metadata.ts",
    "src/scenario-validity.ts",
    "src/negative-coverage.ts",
    "src/mcp-evidence.ts",
    "src/context-economy.ts",
    "src/instruction-calibration.ts",
    "src/executable-helper.ts",
  ],
  format: ["esm"],
  target: "node20",
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
});
