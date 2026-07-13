import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseSkillMd } from "../skill.js";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-skill-"));
  mkdirSync(join(dir, "scripts"), { recursive: true });
  writeFileSync(join(dir, "scripts", "verify.sh"), "#!/bin/sh\nexit 0\n");
  writeFileSync(
    join(dir, "SKILL.md"),
    [
      "---",
      "name: example",
      "description: |",
      "  Use when the user asks for X.",
      "  Do not use for Y.",
      "---",
      "# example",
      "",
      "See [verify](./scripts/verify.sh) and `./scripts/missing.sh`.",
      "",
      "Also link to [external](https://example.com).",
      "",
      "Declare the `skill.test` metric once.",
    ].join("\n"),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("parseSkillMd", () => {
  it("parses metadata and reports local references", async () => {
    const skill = await parseSkillMd(join(dir, "SKILL.md"));
    expect(skill.frontmatter.name).toBe("example");
    expect(skill.frontmatter.description).toMatch(/Use when/);
    expect(skill.references).toContain("./scripts/verify.sh");
    expect(skill.references).toContain("./scripts/missing.sh");
    // External URLs are filtered
    expect(skill.references.find((r) => r.includes("example.com"))).toBeUndefined();
    // Bare dotted identifiers (metric names, not paths) are not references
    expect(skill.references).not.toContain("skill.test");
    expect(skill.missingReferences).toContain("./scripts/missing.sh");
    expect(skill.missingReferences).not.toContain("./scripts/verify.sh");
    expect(skill.totalLines).toBeGreaterThan(8);
  });
});
