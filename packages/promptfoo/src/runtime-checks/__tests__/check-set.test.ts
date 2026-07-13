import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { RUNTIME_CHECK_TYPES } from "../catalog.js";

describe("Runtime Check Set", () => {
  it("is documented in the maintained reference guide", () => {
    const guide = readFileSync("docs/guide/reference.md", "utf8");
    for (const checkType of RUNTIME_CHECK_TYPES) {
      expect(guide).toContain(`\`${checkType}\``);
    }
  });
});
