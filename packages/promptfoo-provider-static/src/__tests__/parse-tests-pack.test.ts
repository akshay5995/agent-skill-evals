import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseTestsPack } from "../tests-pack.js";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "skillkit-tp-"));
  mkdirSync(join(dir, "tests"), { recursive: true });
  mkdirSync(join(dir, "fixtures", "good"), { recursive: true });
  writeFileSync(join(dir, "fixtures", "good", "verify.sh"), "#!/bin/sh\nexit 1\n");
  chmodSync(join(dir, "fixtures", "good", "verify.sh"), 0o755);
  writeFileSync(
    join(dir, "tests", "good.yaml"),
    [
      "- description: positive case",
      "  vars:",
      "    skill: example",
      "    kind: positive",
      "    fixture: ./fixtures/good",
      "    prompt: Do the thing",
      "    preconditions:",
      "      - verifier.fails:",
      "          run: ./verify.sh",
      "    should:",
      "      - file.exists:",
      "          path: marker.txt",
      "    should_not:",
      "      - secret.read",
      "",
      "- description: negative case using mcp",
      "  vars:",
      "    kind: negative",
      "    fixture: ./fixtures/missing",
      "    prompt: Don't",
      "    should_not:",
      "      - mcp.tool_called:",
      "          server: github",
      "          tool: create_pull_request",
      "      - made.up.effect",
    ].join("\n"),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

const KNOWN = new Set([
  "verifier.fails", "verifier.succeeds", "file.exists", "secret.read",
  "mcp.tool_called",
]);

describe("parseTestsPack", () => {
  it("collects tests, effect types, and missing assets", async () => {
    const r = await parseTestsPack({
      testsGlob: "tests/**/*.yaml",
      baseDir: dir,
      knownEffectTypes: KNOWN,
    });
    expect(r.tests).toHaveLength(2);
    expect(r.tests[0]!.description).toBe("positive case");
    expect(r.tests[0]!.effectTypes).toContain("verifier.fails");
    expect(r.tests[0]!.effectTypes).toContain("file.exists");
    expect(r.tests[1]!.usesMcpAssertions).toBe(true);
    expect(r.tests[1]!.isNegative).toBe(true);
  });

  it("flags unresolved effect types and missing fixtures", async () => {
    const r = await parseTestsPack({
      testsGlob: "tests/**/*.yaml",
      baseDir: dir,
      knownEffectTypes: KNOWN,
    });
    expect(r.unresolvedEffectTypes).toContain("made.up.effect");
    expect(r.missingFixturePaths.some((p) => p.endsWith("missing"))).toBe(true);
  });

  it("locates verifier scripts and reports missing ones", async () => {
    const r = await parseTestsPack({
      testsGlob: "tests/**/*.yaml",
      baseDir: dir,
      knownEffectTypes: KNOWN,
    });
    expect(r.verifierScripts.some((s) => s.endsWith("verify.sh"))).toBe(true);
    expect(r.missingVerifierScripts).toHaveLength(0);
  });
});
