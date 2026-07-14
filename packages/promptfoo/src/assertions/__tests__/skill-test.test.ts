import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EvidenceCollector } from "../../agent/evidence.js";
import skillTest from "../skill-test.js";

function makeRun(configure?: (evidence: EvidenceCollector) => void) {
  const runDir = mkdtempSync(join(tmpdir(), "agent-skill-evals-skill-test-"));
  const worldPath = join(runDir, "world");
  mkdirSync(worldPath, { recursive: true });
  const evidence = new EvidenceCollector();
  evidence.setOutput("task completed safely");
  evidence.setRun({ runDir, worldPath, durationMs: 1 });
  configure?.(evidence);
  const evidencePath = join(runDir, "evidence.json");
  writeFileSync(evidencePath, JSON.stringify(evidence.toSnapshot(), null, 2));
  return {
    runDir,
    worldPath,
    metadata: {
      runDir,
      worldPath,
      evidencePath,
      preconditionResults: [],
      preconditionsPassed: true,
      durationMs: 1,
    },
  };
}

async function grade(run: ReturnType<typeof makeRun>, expectEntries?: unknown[]) {
  return skillTest("", {
    providerResponse: { metadata: run.metadata },
    vars: expectEntries === undefined ? {} : { expect: expectEntries },
  });
}

describe("skill.test", () => {
  it("requires a single expect list", async () => {
    const run = makeRun();
    try {
      expect((await grade(run)).reason).toContain("no Runtime Test Fields checks declared");
      const legacy = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: { should: [{ "output.contains": { text: "completed" } }] },
      });
      expect(legacy.pass).toBe(false);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("checks final output", async () => {
    const run = makeRun();
    try {
      expect((await grade(run, [{ "output.contains": { text: "completed" } }])).pass).toBe(true);
      expect((await grade(run, [{ "output.matches": { pattern: "^task.+safely$" } }])).pass).toBe(true);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("records verifier results", async () => {
    const run = makeRun();
    writeFileSync(join(run.worldPath, "verify.sh"), "#!/bin/sh\nexit 0\n");
    chmodSync(join(run.worldPath, "verify.sh"), 0o755);
    try {
      expect((await grade(run, [{ "verifier.succeeds": { run: "./verify.sh" } }])).pass).toBe(true);
      const evidence = JSON.parse(readFileSync(run.metadata.evidencePath, "utf8"));
      expect(evidence.commands).toMatchObject([{ command: "./verify.sh", exitCode: 0 }]);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("checks observed tool calls and loaded skills", async () => {
    const run = makeRun((evidence) => {
      evidence.addToolCall({ tool: "Edit", provider: "codex-json", startedAt: 1, durationMs: 2 });
      evidence.addSkillLoad({ skill: "bugfix", delivery: "explicit", provider: "codex-json", source: "$bugfix", startedAt: 1 });
    });
    try {
      const result = await grade(run, [
        { "tool.called": { tool: "Edit" } },
        { "tool.not_called": { tool: "Write" } },
        { "skill.loaded": { skills: ["bugfix"] } },
        { "skill.not_loaded": { skills: ["unrelated"] } },
      ]);
      expect(result.pass).toBe(true);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("fails closed on incomplete adapter evidence", async () => {
    const run = makeRun((evidence) => evidence.addWarning("unrecognized event"));
    try {
      const result = await grade(run, [{ "output.contains": { text: "completed" } }]);
      expect(result.pass).toBe(false);
      expect(result.reason).toContain("evidence warning");
      expect(result.reason).toContain("Evidence:");
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });
});
