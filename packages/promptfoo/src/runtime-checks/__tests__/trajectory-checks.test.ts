import { describe, expect, it } from "vitest";
import { toolCount, toolNotCalled, toolSequence, turnCount } from "../tool-turn-checks.js";
import type {
  AgentSkillEvalsAssertionResult,
  EvidenceHandle,
  WorldHandle,
} from "../../internal-types.js";

const world = {} as WorldHandle;

function evidenceWith(input: {
  toolCalls?: Array<{ tool: string; turn?: number; args?: unknown }>;
  agentTurns?: number;
}): EvidenceHandle {
  const toolCalls = (input.toolCalls ?? []).map((call, index) => ({
    startedAt: index,
    durationMs: 0,
    ...call,
  }));
  const turns = Array.from({ length: input.agentTurns ?? 0 }, (_, i) => ({
    turn: i + 1,
    role: "agent" as const,
    text: "",
    startedAt: 0,
    durationMs: 0,
  }));
  return {
    output: () => "",
    commands: () => [],
    filesWritten: () => [],
    toolCalls: () => toolCalls,
    skillsLoaded: () => [],
    skillsAvailable: () => [],
    usage: () => ({}),
    turns: () => turns,
  };
}

function run(
  plugin: typeof toolCount,
  assertion: unknown,
  evidence: EvidenceHandle,
  mode: "should" | "should_not" = "should",
): AgentSkillEvalsAssertionResult {
  // These checks are synchronous (no I/O), so verify returns a value directly.
  return plugin.verify({ assertion, world, evidence, mode }) as AgentSkillEvalsAssertionResult;
}

describe("tool.count", () => {
  const evidence = evidenceWith({
    toolCalls: [
      { tool: "Edit", turn: 1 },
      { tool: "Edit", turn: 2 },
      { tool: "Bash", turn: 3 },
    ],
  });

  it("bounds matching calls", () => {
    expect(run(toolCount, { tool: "Edit", max: 2 }, evidence).pass).toBe(true);
    expect(run(toolCount, { tool: "Edit", max: 1 }, evidence).pass).toBe(false);
    expect(run(toolCount, { min: 3 }, evidence).pass).toBe(true);
  });

  it("scopes by turn filters", () => {
    expect(run(toolCount, { tool: "Edit", before_turn: 2, max: 1 }, evidence).pass).toBe(true);
    expect(run(toolCount, { tool: "Bash", before_turn: 3, max: 0 }, evidence).pass).toBe(true);
    expect(run(toolCount, { tool: "Bash", after_turn: 2, min: 1 }, evidence).pass).toBe(true);
    expect(run(toolCount, { turn: 2, min: 1, max: 1 }, evidence).pass).toBe(true);
  });

  it("treats untagged single-turn calls as turn 1", () => {
    const single = evidenceWith({ toolCalls: [{ tool: "Edit" }] });
    expect(run(toolCount, { tool: "Edit", turn: 1, min: 1 }, single).pass).toBe(true);
  });

  it("requires a bound", () => {
    const result = run(toolCount, { tool: "Edit" }, evidence);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("set min and/or max");
  });

  it("inverts under should_not", () => {
    expect(run(toolCount, { tool: "Edit", max: 1 }, evidence, "should_not").pass).toBe(true);
  });
});

describe("tool.not_called", () => {
  it("requires at least one selector", () => {
    const result = run(toolNotCalled, {}, evidenceWith({}));
    expect(result.pass).toBe(false);
    expect(result.reason).toContain("at least one selector");
  });

  it("rejects empty selectors", () => {
    expect(run(toolNotCalled, { tool: "" }, evidenceWith({})).pass).toBe(false);
    expect(run(toolNotCalled, { provider: "" }, evidenceWith({})).pass).toBe(false);
    expect(run(toolNotCalled, { server: "" }, evidenceWith({})).pass).toBe(false);
  });
});

describe("tool.sequence", () => {
  const evidence = evidenceWith({
    toolCalls: [
      { tool: "Read" },
      { tool: "Edit" },
      { tool: "Bash" },
      { tool: "Edit" },
    ],
  });

  it("matches ordered subsequences with gaps", () => {
    expect(run(toolSequence, { order: ["Read", "Bash", "Edit"] }, evidence).pass).toBe(true);
    expect(run(toolSequence, { order: ["Read", "Edit"] }, evidence).pass).toBe(true);
  });

  it("fails when the order is violated and names the stuck step", () => {
    const result = run(toolSequence, { order: ["Bash", "Read"] }, evidence);
    expect(result.pass).toBe(false);
    expect(result.reason).toContain('stuck at "Read"');
  });

  it("requires at least two steps", () => {
    expect(run(toolSequence, { order: ["Read"] }, evidence).pass).toBe(false);
  });
});

describe("turn.count", () => {
  it("counts agent turns from turn records", () => {
    const evidence = evidenceWith({ agentTurns: 3 });
    expect(run(turnCount, { max: 3 }, evidence).pass).toBe(true);
    expect(run(turnCount, { max: 2 }, evidence).pass).toBe(false);
    expect(run(turnCount, { min: 2, max: 5 }, evidence).pass).toBe(true);
  });

  it("treats a single-turn run as one turn", () => {
    const evidence = evidenceWith({});
    expect(run(turnCount, { max: 1 }, evidence).pass).toBe(true);
    expect(run(turnCount, { min: 2 }, evidence).pass).toBe(false);
  });

  it("requires a bound", () => {
    const evidence = evidenceWith({ agentTurns: 1 });
    expect(run(turnCount, {}, evidence).pass).toBe(false);
  });
});
