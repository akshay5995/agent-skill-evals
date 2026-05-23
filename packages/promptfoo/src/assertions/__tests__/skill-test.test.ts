import { describe, expect, it } from "vitest";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import skillTest from "../skill-test.js";
import { EvidenceCollector } from "../../agent/evidence.js";

function makeRun() {
  const runDir = mkdtempSync(join(tmpdir(), "agent-skill-evals-skill-test-"));
  const worldPath = join(runDir, "world");
  mkdirSync(worldPath, { recursive: true });
  const evidence = new EvidenceCollector();
  evidence.setOutput("done");
  evidence.setRun({ runDir, worldPath, fixture: "./fixture", durationMs: 1 });
  const evidencePath = join(runDir, "evidence.json");
  writeFileSync(evidencePath, JSON.stringify(evidence.toSnapshot(), null, 2));
  return {
    runDir,
    worldPath,
    metadata: {
      runDir,
      worldPath,
      evidencePath,
      fixture: "./fixture",
      preconditionResults: [],
      preconditionsPassed: true,
      durationMs: 1,
    },
  };
}

function makeRunWithEvidence(configure: (evidence: EvidenceCollector) => void) {
  const run = makeRun();
  const evidence = new EvidenceCollector();
  evidence.setOutput("done");
  evidence.setRun({
    runDir: run.runDir,
    worldPath: run.worldPath,
    fixture: "./fixture",
    durationMs: 1,
  });
  configure(evidence);
  writeFileSync(run.metadata.evidencePath, JSON.stringify(evidence.toSnapshot(), null, 2));
  return run;
}

describe("skill.test", () => {
  it("fails when no Runtime Test Fields checks are declared", async () => {
    const run = makeRun();
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: {},
      });
      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/no Runtime Test Fields checks declared/);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("fails malformed Runtime Test Fields", async () => {
    const run = makeRun();
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: { should: [{ "file.contains": "app.js" }] },
      });
      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/Runtime Test Field|runtime test field/i);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("rejects double-negative checks under should_not", async () => {
    const run = makeRun();
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: {
          should_not: [{ "tool.not_called": { tool: "Write" } }],
        },
      });
      expect(result.pass).toBe(false);
      expect(result.reason).toMatch(/must be declared under should/);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("records verifier command results into evidence.json", async () => {
    const run = makeRun();
    const verifier = join(run.worldPath, "verify.sh");
    writeFileSync(verifier, "#!/bin/sh\nexit 0\n");
    chmodSync(verifier, 0o755);
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: {
          should: [{ "verifier.succeeds": { run: "./verify.sh" } }],
        },
      });
      expect(result.pass).toBe(true);
      const persisted = JSON.parse(readFileSync(run.metadata.evidencePath, "utf8")) as {
        commands: Array<{ command: string; exitCode: number }>;
      };
      expect(persisted.commands).toMatchObject([{ command: "./verify.sh", exitCode: 0 }]);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("evaluates tool-call checks from Core Evidence", async () => {
    const run = makeRunWithEvidence((evidence) => {
      evidence.addToolCall({
        tool: "Edit",
        provider: "codex-json",
        args: { path: "app.js", newString: "/dashboard" },
        result: "ok",
        startedAt: 1,
        durationMs: 2,
      });
    });
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: {
          should: [
            {
              "tool.called": {
                tool: "Edit",
                provider: "codex-json",
                args_match: { path: "app.js" },
              },
            },
            { "tool.not_called": { tool: "Bash" } },
          ],
        },
      });
      expect(result.pass).toBe(true);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("evaluates loaded-skill checks from MCP resource-read evidence", async () => {
    const run = makeRunWithEvidence((evidence) => {
      evidence.addToolCall({
        tool: "read_resource",
        provider: "claude-code-json",
        server: "agent_skill_evals",
        args: { uri: "skill://brand-deck/SKILL.md" },
        result: "ok",
        startedAt: 1,
        durationMs: 2,
      });
    });
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: {
          should: [
            {
              "skill.loaded": {
                should_include: ["brand-deck"],
                should_exclude: ["bugfix-workflow"],
              },
            },
          ],
        },
      });
      expect(result.pass).toBe(true);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("evaluates loaded-skill checks from Core Evidence", async () => {
    const run = makeRunWithEvidence((evidence) => {
      evidence.addSkillLoad({
        skill: "brand-deck",
        delivery: "mcp",
        provider: "claude-code-json",
        server: "agent-skill-evals",
        source: "load_brand_deck_skill",
        startedAt: 1,
      });
    });
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: {
          should: [
            {
              "skill.loaded": {
                delivery: "mcp",
                server: "agent-skill-evals",
                should_include: ["brand-deck"],
                should_exclude: ["bugfix-workflow"],
              },
            },
          ],
        },
      });
      expect(result.pass).toBe(true);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("honors should_not polarity for loaded-skill checks", async () => {
    const run = makeRunWithEvidence((evidence) => {
      evidence.addSkillLoad({
        skill: "brand-deck",
        delivery: "mcp",
        provider: "claude-code-json",
        startedAt: 1,
      });
    });
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: {
          should_not: [
            {
              "skill.loaded": {
                should_include: ["bugfix-workflow"],
              },
            },
          ],
        },
      });
      expect(result.pass).toBe(true);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it.each([
    ["file.exists", {}],
    ["file.exists", { path: "" }],
    ["file.created", {}],
    ["file.created", { path: "" }],
    ["file.not_modified", {}],
    ["file.not_modified", { path: "" }],
  ])("fails %s when path is missing or empty", async (type, args) => {
    const run = makeRun();
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: { should: [{ [type]: args }] },
      });
      expect(result.pass).toBe(false);
      expect(result.reason).toContain(`${type}: assertion.path must be a non-empty string`);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("passes file.not_modified when the file is absent and no write evidence exists", async () => {
    const run = makeRun();
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: { should: [{ "file.not_modified": { path: "missing.txt" } }] },
      });
      expect(result.pass).toBe(true);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("fails file.not_modified when write evidence exists for an absent file path", async () => {
    const run = makeRunWithEvidence((evidence) => {
      evidence.addFileWrite({ path: "missing.txt", op: "modify" });
    });
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: { should: [{ "file.not_modified": { path: "missing.txt" } }] },
      });
      expect(result.pass).toBe(false);
      expect(result.reason).toContain("file.not_modified: missing.txt was modified");
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it.each([
    [{}],
    [{ scope: [] }],
    [{ scope: [""] }],
    [{ scope: ["src/", ""] }],
  ])("fails file.changes_outside_scope when scope is missing or empty", async (args) => {
    const run = makeRun();
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: { should: [{ "file.changes_outside_scope": args }] },
      });
      expect(result.pass).toBe(false);
      expect(result.reason).toContain(
        "file.changes_outside_scope: assertion.scope must contain at least one non-empty string",
      );
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("passes unfiltered tool.not_called when no tool calls were recorded", async () => {
    const run = makeRun();
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: { should: ["tool.not_called"] },
      });
      expect(result.pass).toBe(true);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("fails unfiltered tool.not_called when any tool call was recorded", async () => {
    const run = makeRunWithEvidence((evidence) => {
      evidence.addToolCall({
        tool: "Edit",
        provider: "codex-json",
        args: { path: "app.js" },
        result: "ok",
        startedAt: 1,
        durationMs: 2,
      });
    });
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: { should: ["tool.not_called"] },
      });
      expect(result.pass).toBe(false);
      expect(result.reason).toContain("forbidden built-in tool call observed");
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });

  it("accepts args_match as the only tool.not_called selector", async () => {
    const run = makeRunWithEvidence((evidence) => {
      evidence.addToolCall({
        tool: "Edit",
        provider: "codex-json",
        args: { path: "app.js" },
        result: "ok",
        startedAt: 1,
        durationMs: 2,
      });
    });
    try {
      const result = await skillTest("", {
        providerResponse: { metadata: run.metadata },
        vars: { should: [{ "tool.not_called": { args_match: { path: "missing.js" } } }] },
      });
      expect(result.pass).toBe(true);
    } finally {
      rmSync(run.runDir, { recursive: true, force: true });
    }
  });
});
