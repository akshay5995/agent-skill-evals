import { describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentSkillEvalsProvider } from "../index.js";
import { decodeEvidenceSnapshot } from "../../evidence-schema.js";

interface RecordedEvidence {
  runtime?: {
    adapter?: string;
    preset?: string;
    command?: string;
    cliVersion?: string;
    model?: string;
  };
  warnings?: string[];
}

async function runStubAgent(scriptLines: string[], adapter = "claude-code-json") {
  const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-runtime-"));
  const fixture = join(dir, "fixture");
  const agent = join(dir, "agent.mjs");
  mkdirSync(fixture);
  writeFileSync(join(fixture, "app.js"), "console.log('fixture');\n");
  writeFileSync(agent, scriptLines.join("\n"));
  const provider = new AgentSkillEvalsProvider({
    config: { adapter, command: "node", args: [agent], baseDir: dir },
  });
  const response = await provider.callApi("fix it", { vars: { fixture } });
  const evidence = JSON.parse(
    readFileSync(response.metadata?.evidencePath as string, "utf8"),
  ) as RecordedEvidence;
  return { dir, response, evidence };
}

describe("runtime identity in evidence", () => {
  it("records adapter, command, and CLI version for every run", async () => {
    const { dir, evidence, response } = await runStubAgent([
      "console.log(JSON.stringify({ type: 'result', result: 'done' }));",
    ]);
    try {
      expect(evidence.runtime?.adapter).toBe("claude-code-json");
      expect(evidence.runtime?.command).toBe("node");
      // The stub agent is node itself, so --version yields the node version.
      expect(evidence.runtime?.cliVersion).toMatch(/^v\d+/);
      const metaRuntime = (response.metadata as { runtime?: RecordedEvidence["runtime"] }).runtime;
      expect(metaRuntime?.adapter).toBe("claude-code-json");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records the latest model reported by the CLI", async () => {
    const { dir, evidence } = await runStubAgent([
      "console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-4' }));",
      "console.log(JSON.stringify({ type: 'assistant', message: { model: 'claude-sonnet-5', content: [] } }));",
      "console.log(JSON.stringify({ type: 'result', result: 'done' }));",
    ]);
    try {
      expect(evidence.runtime?.model).toBe("claude-sonnet-5");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("warns when the CLI emits unrecognized event types", async () => {
    const { dir, evidence } = await runStubAgent([
      "console.log(JSON.stringify({ type: 'tool_call_v2', name: 'Edit' }));",
      "console.log(JSON.stringify({ type: 'tool_call_v2', name: 'Bash' }));",
      "console.log(JSON.stringify({ type: 'result', result: 'done' }));",
    ]);
    try {
      expect(evidence.warnings).toHaveLength(1);
      expect(evidence.warnings?.[0]).toContain("tool_call_v2 (2)");
      expect(evidence.warnings?.[0]).toContain("may have changed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("emits no warnings for a clean known-schema run", async () => {
    const { dir, evidence } = await runStubAgent([
      "console.log(JSON.stringify({ type: 'system', subtype: 'init', model: 'claude-sonnet-5' }));",
      "console.log(JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 2, output_tokens: 1 }, content: [] } }));",
      "console.log(JSON.stringify({ type: 'result', result: 'done' }));",
    ]);
    try {
      expect(evidence.warnings).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("records config.model when the CLI does not report one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-runtime-"));
    const fixture = join(dir, "fixture");
    const agent = join(dir, "agent.mjs");
    mkdirSync(fixture);
    writeFileSync(join(fixture, "app.js"), "console.log('fixture');\n");
    writeFileSync(
      agent,
      "console.log(JSON.stringify({ type: 'agent_message', message: 'done' }));\n",
    );
    try {
      const provider = new AgentSkillEvalsProvider({
        config: {
          adapter: "codex-json",
          command: "node",
          args: [agent],
          baseDir: dir,
          model: "gpt-5.2-codex",
        },
      });
      const response = await provider.callApi("fix it", { vars: { fixture } });
      const evidence = JSON.parse(
        readFileSync(response.metadata?.evidencePath as string, "utf8"),
      ) as RecordedEvidence;
      expect(evidence.runtime?.model).toBe("gpt-5.2-codex");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("evidence schema versions", () => {
  it("rejects legacy evidence so availability is never fabricated", () => {
    const legacy = {
      schemaVersion: "agent-skill-evals.evidence.v1",
      output: "done",
      run: { runDir: "/tmp/r", worldPath: "/tmp/r/world", fixture: "./f" },
      commands: [],
      filesWritten: [],
      toolCalls: [],
      skillsLoaded: [],
      usage: {},
    };
    const decoded = decodeEvidenceSnapshot(legacy);
    expect(decoded.ok).toBe(false);
  });
});
