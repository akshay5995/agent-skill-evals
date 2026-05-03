import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import preconditions from "../preconditions.js";
import should from "../should.js";
import shouldNot from "../should-not.js";
import budget from "../budget.js";
import type { SkillKitProviderMetadata } from "@skillkit/promptfoo-provider-agent";

let runDir: string;
let worldPath: string;
let evidencePath: string;

function meta(over: Partial<SkillKitProviderMetadata> = {}): SkillKitProviderMetadata {
  return {
    runDir,
    worldPath,
    evidencePath,
    fixture: worldPath,
    preconditionResults: [],
    preconditionsPassed: true,
    durationMs: 100,
    ...over,
  };
}

beforeAll(() => {
  runDir = mkdtempSync(join(tmpdir(), "skillkit-asrt-"));
  worldPath = join(runDir, "world");
  evidencePath = join(runDir, "evidence.json");
  mkdirSync(worldPath, { recursive: true });
  writeFileSync(join(worldPath, "marker.txt"), "hello\n");
  writeFileSync(
    evidencePath,
    JSON.stringify({
      commands: [
        { command: "git", args: ["push", "origin", "main"], exitCode: 0, startedAt: 1, durationMs: 1 },
      ],
      filesWritten: [],
      networkCalls: [],
      secretsAccessed: [],
      toolCalls: [{ tool: "Bash", startedAt: 1, durationMs: 1 }],
      usage: { totalTokens: 500 },
    }),
  );
});

afterAll(() => {
  rmSync(runDir, { recursive: true, force: true });
});

describe("preconditions assertion", () => {
  it("passes when no preconditions declared", async () => {
    const r = await preconditions("", { providerResponse: { metadata: meta() } });
    expect(r.pass).toBe(true);
  });

  it("fails when any precondition failed", async () => {
    const r = await preconditions("", {
      providerResponse: {
        metadata: meta({
          preconditionResults: [
            { pass: true, score: 1, reason: "ok" },
            { pass: false, score: 0, reason: "scenario already solved" },
          ],
          preconditionsPassed: false,
        }),
      },
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/scenario already solved/);
  });

  it("fails when provider metadata is missing", async () => {
    const r = await preconditions("", { vars: {} });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/metadata missing/);
  });
});

describe("should assertion", () => {
  it("passes when verifier succeeds", async () => {
    const r = await should("", {
      providerResponse: { metadata: meta() },
      vars: { should: [{ "file.exists": { path: "marker.txt" } }] },
    });
    expect(r.pass).toBe(true);
  });

  it("fails when verifier reports missing file", async () => {
    const r = await should("", {
      providerResponse: { metadata: meta() },
      vars: { should: [{ "file.exists": { path: "missing.txt" } }] },
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/not found/);
  });

  it("rejects unknown effect type", async () => {
    const r = await should("", {
      providerResponse: { metadata: meta() },
      vars: { should: [{ "made.up.type": {} }] },
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/unknown effect type/);
  });
});

describe("should_not assertion", () => {
  it("fails when forbidden effect observed (push to main)", async () => {
    const r = await shouldNot("", {
      providerResponse: { metadata: meta() },
      vars: { should_not: [{ "git.push_to_branch": { branch: "main" } }] },
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/push to main/);
  });

  it("passes when forbidden effect absent", async () => {
    const r = await shouldNot("", {
      providerResponse: { metadata: meta() },
      vars: { should_not: ["secret.read"] },
    });
    expect(r.pass).toBe(true);
  });
});

describe("budget assertion", () => {
  it("passes within budget", async () => {
    const r = await budget("", {
      providerResponse: { metadata: meta() },
      vars: {
        budget: { max_runtime_seconds: 10, max_tool_calls: 5, max_total_tokens: 1000 },
      },
    });
    expect(r.pass).toBe(true);
    expect(r.reason).toMatch(/runtime/);
  });

  it("fails when over budget", async () => {
    const r = await budget("", {
      providerResponse: { metadata: meta({ durationMs: 60_000 }) },
      vars: { budget: { max_runtime_seconds: 1 } },
    });
    expect(r.pass).toBe(false);
  });

  it("passes silently when no limits declared", async () => {
    const r = await budget("", {
      providerResponse: { metadata: meta() },
      vars: { budget: {} },
    });
    expect(r.pass).toBe(true);
  });
});
