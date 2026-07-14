import { defineConfig } from "tsdown";

export default defineConfig({
  clean: true,
  entry: {
    "agent/index": "src/agent/index.ts",
    "assertions/index": "src/assertions/index.ts",
    "test-generator/index": "src/test-pack.ts",
    "cli/init": "src/cli/init.ts",
  },
  dts: true,
  format: "esm",
});
