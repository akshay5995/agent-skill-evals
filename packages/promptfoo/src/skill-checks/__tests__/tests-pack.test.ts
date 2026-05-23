import { describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTestsPack } from "../tests-pack.js";

function makeTestsPackFixture() {
  const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-tests-pack-"));
  mkdirSync(join(dir, "fixtures", "bug"), { recursive: true });
  mkdirSync(join(dir, "tests"), { recursive: true });
  writeFileSync(join(dir, "fixtures", "bug", "verify.sh"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(dir, "fixtures", "bug", "verify.sh"), 0o755);
  writeFileSync(
    join(dir, "tests", "bugfix.yaml"),
    [
      "- description: fixes bug",
      "  vars:",
      "    prompt: Fix the bug",
      "    fixture: ./fixtures/bug",
      "    preconditions:",
      "      - file.exists:",
      "          path: package.json",
      "    should:",
      "      - verifier.succeeds:",
      "          run: ./verify.sh",
      "  assert:",
      "    - type: javascript",
      "      metric: skill.budget",
      "      value: file://./agent-skill-evals/assertions.js",
      "      config:",
      "        metric: skill.budget",
    ].join("\n"),
  );
  return dir;
}

describe("parseTestsPack", () => {
  it("parses test metadata and resolves verifier scripts through the fixture", async () => {
    const dir = makeTestsPackFixture();
    try {
      const pack = await parseTestsPack({
        testsGlob: "./tests/*.yaml",
        baseDir: dir,
        knownEffectTypes: new Set(["file.exists", "verifier.succeeds"]),
      });

      expect(pack.parseErrors).toEqual([]);
      expect(pack.tests).toHaveLength(1);
      expect(pack.tests[0]).toMatchObject({
        description: "fixes bug",
        effectTypes: ["file.exists", "verifier.succeeds"],
        hasFixture: true,
        hasPrecondition: true,
        hasTokenBudget: true,
        isDraft: false,
        isNegative: false,
      });
      expect(pack.verifierScripts).toEqual([join(dir, "fixtures", "bug", "verify.sh")]);
      expect(pack.missingVerifierScripts).toEqual([]);
      expect(pack.nonExecutableVerifierScripts).toEqual([]);
      expect(pack.unresolvedEffectTypes).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps parse errors and unresolved effect types in metadata", async () => {
    const dir = makeTestsPackFixture();
    try {
      writeFileSync(
        join(dir, "tests", "custom.yaml"),
        [
          "- description: custom effect",
          "  vars:",
          "    prompt: Fix the bug",
          "    fixtureless: true",
          "    should:",
          "      - custom.effect:",
          "          value: true",
        ].join("\n"),
      );
      writeFileSync(
        join(dir, "tests", "broken.yaml"),
        [
          "- description: broken",
          "  vars:",
          "    prompt: [unterminated",
        ].join("\n"),
      );

      const pack = await parseTestsPack({
        testsGlob: "./tests/*.yaml",
        baseDir: dir,
        knownEffectTypes: new Set(["file.exists", "verifier.succeeds"]),
      });

      expect(pack.parseErrors).toEqual([
        expect.objectContaining({
          filePath: join(dir, "tests", "broken.yaml"),
          error: expect.stringMatching(/unterminated|flow sequence/i),
        }),
      ]);
      expect(pack.unresolvedEffectTypes).toContain("custom.effect");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
