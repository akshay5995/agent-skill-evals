import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { RUNTIME_CHECK_TYPES, corePlugins } from "../index.js";

describe("Runtime Check Set", () => {
  it("matches the runtime registry", () => {
    expect(corePlugins.map((plugin) => plugin.type)).toEqual(RUNTIME_CHECK_TYPES);
  });

  it("is documented in the maintained runtime checks guide", () => {
    const guide = readFileSync("docs/guide/runtime-checks.md", "utf8");
    for (const checkType of RUNTIME_CHECK_TYPES) {
      expect(guide).toContain(`\`${checkType}\``);
    }
  });
});
