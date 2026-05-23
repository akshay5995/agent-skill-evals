import { describe, expect, it } from "vitest";
import { parseEvidenceSnapshot } from "../evidence-schema.js";

const baseEvidence = {
  schemaVersion: "agent-skill-evals.evidence.v1",
  output: "done",
  run: {
    runDir: "/tmp/run",
    worldPath: "/tmp/run/world",
    fixture: "./fixtures/bug",
  },
};

describe("Evidence Schema", () => {
  it("accepts produced v1 file operations", () => {
    expect(
      parseEvidenceSnapshot({
        ...baseEvidence,
        filesWritten: [{ path: "app.js", op: "modify" }],
      }).filesWritten,
    ).toEqual([{ path: "app.js", op: "modify" }]);
  });

  it("accepts optional normalized tool-call server names", () => {
    expect(
      parseEvidenceSnapshot({
        ...baseEvidence,
        toolCalls: [{
          tool: "Edit",
          provider: "codex-json",
          server: "filesystem",
          startedAt: 1,
          durationMs: 2,
        }],
      }).toolCalls,
    ).toEqual([{
      tool: "Edit",
      provider: "codex-json",
      server: "filesystem",
      startedAt: 1,
      durationMs: 2,
    }]);
  });

  it("accepts loaded skill evidence", () => {
    expect(
      parseEvidenceSnapshot({
        ...baseEvidence,
        skillsLoaded: [{
          skill: "brand-deck",
          delivery: "mcp",
          provider: "claude-code-json",
          server: "agent-skill-evals",
          source: "load_brand_deck_skill",
          startedAt: 1,
        }],
      }).skillsLoaded,
    ).toEqual([{
      skill: "brand-deck",
      delivery: "mcp",
      provider: "claude-code-json",
      server: "agent-skill-evals",
      source: "load_brand_deck_skill",
      startedAt: 1,
    }]);
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
