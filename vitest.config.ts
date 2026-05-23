import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "agent-skill-evals/agent": fileURLToPath(new URL("./packages/promptfoo/src/agent/index.ts", import.meta.url)),
      "agent-skill-evals/skill-checks": fileURLToPath(new URL("./packages/promptfoo/src/skill-checks/index.ts", import.meta.url)),
      "agent-skill-evals/assertions": fileURLToPath(new URL("./packages/promptfoo/src/assertions/index.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    passWithNoTests: true,
    include: ["packages/**/src/**/*.test.ts"],
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "docs/.vitepress/**",
    ],
    reporters: process.env.CI ? ["default", "github-actions"] : ["default"],
  },
});
