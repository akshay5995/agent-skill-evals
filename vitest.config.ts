import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    passWithNoTests: true,
    include: ["packages/**/src/**/*.test.ts"],
    reporters: process.env.CI ? ["default", "github-actions"] : ["default"],
  },
});
