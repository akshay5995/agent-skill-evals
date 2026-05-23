import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    "agent/index": "src/agent/index.ts",
    "skill-checks/index": "src/skill-checks/index.ts",
    "assertions/index": "src/assertions/index.ts",
  },
  dts: true,
  format: "esm",
});
