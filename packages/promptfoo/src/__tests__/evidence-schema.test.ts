import { describe, expect, it } from "vitest";
import { parseEvidenceSnapshot } from "../evidence-schema.js";

const baseEvidence = {
  schemaVersion: "agent-skill-evals.evidence.v2",
  output: "done",
  run: {
    runDir: "/tmp/run",
    worldPath: "/tmp/run/world",
    fixture: "./fixtures/bug",
  },
};

describe("Evidence Schema", () => {
  it("accepts produced evidence fields", () => {
    const evidence = {
      ...baseEvidence,
      filesWritten: [{ path: "app.js", op: "modify" }],
      toolCalls: [
        {
          tool: "Edit",
          provider: "codex-json",
          server: "filesystem",
          startedAt: 1,
          durationMs: 2,
        },
      ],
      skillsLoaded: [
        {
          skill: "brand-deck",
          delivery: "mcp",
          provider: "claude-code-json",
          server: "agent-skill-evals",
          source: "load_brand_deck_skill",
          startedAt: 1,
        },
      ],
      skillsAvailable: [{ skill: "brand-deck", path: "/tmp/skills/brand-deck", role: "under-test" }],
    };
    expect(parseEvidenceSnapshot(evidence)).toMatchObject(evidence);
  });

  it("rejects unproduced file fields", () => {
    expect(() =>
      parseEvidenceSnapshot({
        ...baseEvidence,
        filesWritten: [{ path: "app.js", op: "rename", bytesAfter: 10 }],
      }),
    ).toThrow();
  });
});
