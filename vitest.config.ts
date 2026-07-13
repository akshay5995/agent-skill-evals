import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "agent-skill-evals/agent": fileURLToPath(new URL("./packages/promptfoo/src/agent/index.ts", import.meta.url)),
      "agent-skill-evals/assertions": fileURLToPath(new URL("./packages/promptfoo/src/assertions/index.ts", import.meta.url)),
      "agent-skill-evals/test-generator": fileURLToPath(new URL("./packages/promptfoo/src/test-pack.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    include: [
      "packages/**/src/**/*.test.ts",
      "examples/scripts/**/*.test.mjs",
    ],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "docs/.vitepress/**",
    ],
    reporters: process.env.CI ? ["default", "github-actions"] : ["default"],
  },
});
