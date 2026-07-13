import { describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentSkillEvalsProvider } from "../index.js";
import { decodeConversationSpec } from "../conversation.js";
import type { EvidenceSnapshot } from "../../evidence-schema.js";

// Stub agent CLI (codex-json adapter, prompt delivered as the "-" arg):
// echoes the prompt back, reports one tool call and fixed usage per run.
const AGENT_STUB = `
const prompt = process.argv[2] ?? "";
console.log(JSON.stringify({ type: "tool_call", tool: "Edit", args: { path: "app.js" } }));
console.log(JSON.stringify({ type: "usage", usage: { input_tokens: 10, output_tokens: 5 } }));
console.log(JSON.stringify({ type: "agent_message", message: "got:" + prompt }));
`;

// Stub simulated-user CLI: replies once, then ends the conversation. Uses a
// counter file in its cwd to keep state across invocations.
const SIM_USER_STUB = `
import { existsSync, writeFileSync } from "node:fs";
console.log(JSON.stringify({ type: "tool_call", tool: "Bash", args: { command: "sneaky" } }));
if (existsSync("counter")) {
  console.log(JSON.stringify({ type: "agent_message", message: "<<DONE>>" }));
} else {
  writeFileSync("counter", "1");
  console.log(JSON.stringify({ type: "agent_message", message: "add more tests" }));
}
`;

// Stub agent CLI that succeeds on its first turn, then fails (nonzero exit,
// no parsable output) on every turn after. A counter file in its cwd tracks
// invocation count across turns.
const AGENT_FAIL_ON_SECOND_TURN_STUB = `
import { existsSync, writeFileSync } from "node:fs";
const prompt = process.argv[2] ?? "";
if (existsSync("turn-count")) {
  console.error("boom: turn 2 failure");
  process.exit(1);
} else {
  writeFileSync("turn-count", "1");
  console.log(JSON.stringify({ type: "agent_message", message: "got:" + prompt }));
}
`;

function makeDir() {
  const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-conv-"));
  const fixture = join(dir, "fixture");
  mkdirSync(fixture);
  writeFileSync(join(fixture, "app.js"), "console.log('fixture');\n");
  const agent = join(dir, "agent.mjs");
  writeFileSync(agent, AGENT_STUB);
  return { dir, fixture, agent };
}

function readEvidence(evidencePath: unknown): EvidenceSnapshot {
  return JSON.parse(readFileSync(evidencePath as string, "utf8")) as EvidenceSnapshot;
}

describe("scripted multi-turn conversations", () => {
  it("runs each scripted turn, tags evidence, and sums usage per turn", async () => {
    const { dir, fixture, agent } = makeDir();
    try {
      const provider = new AgentSkillEvalsProvider({
        config: { adapter: "codex-json", command: "node", args: [agent, "-"], baseDir: dir },
      });
      const response = await provider.callApi("first", {
        vars: {
          fixture,
          conversation: { userTurns: ["second", "third"] },
        },
      });

      expect(response.error).toBeUndefined();
      const evidence = readEvidence(response.metadata?.evidencePath);

      const turns = evidence.turns ?? [];
      expect(turns.map((t) => `${t.turn}:${t.role}`)).toEqual([
        "1:user", "1:agent", "2:user", "2:agent", "3:user", "3:agent",
      ]);
      // User records carry the plain message, not the replay envelope.
      expect(turns[2]?.text).toBe("second");
      // Later agent turns receive the transcript replay.
      expect(turns[3]?.text).toContain("Transcript so far");
      expect(turns[3]?.text).toContain("User: second");
      // Turn 1 sends the raw prompt with no envelope.
      expect(turns[1]?.text).toBe("got:first");

      // Tool calls are tagged with the turn that made them.
      expect(evidence.toolCalls.map((t) => t.turn)).toEqual([1, 2, 3]);

      // Usage sums across turns even though the adapter overwrites per run.
      expect(evidence.usage.totalTokens).toBe(45);
      expect(turns[1]?.usage?.totalTokens).toBe(15);

      // Final output is the last agent turn's message.
      expect(response.output).toContain("User: third");
      expect(response.tokenUsage?.total).toBe(45);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps single-turn behavior identical when conversation is absent", async () => {
    const { dir, fixture, agent } = makeDir();
    try {
      const provider = new AgentSkillEvalsProvider({
        config: { adapter: "codex-json", command: "node", args: [agent, "-"], baseDir: dir },
      });
      const response = await provider.callApi("solo", { vars: { fixture } });
      const evidence = readEvidence(response.metadata?.evidencePath);
      expect(evidence.turns).toBeUndefined();
      expect(evidence.toolCalls[0]?.turn).toBeUndefined();
      expect(evidence.usage.totalTokens).toBe(15);
      expect(response.output).toBe("got:solo");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects a conversation with both scripted and simulated users", async () => {
    const { dir, fixture, agent } = makeDir();
    try {
      const provider = new AgentSkillEvalsProvider({
        config: { adapter: "codex-json", command: "node", args: [agent, "-"], baseDir: dir },
      });
      const response = await provider.callApi("first", {
        vars: {
          fixture,
          conversation: { userTurns: ["a"], user: { goal: "g" } },
        },
      });
      expect(response.error).toMatch(/not both/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("stops the loop and surfaces the error when the agent fails mid-conversation", async () => {
    const { dir, fixture } = makeDir();
    const agent = join(dir, "agent-fail.mjs");
    writeFileSync(agent, AGENT_FAIL_ON_SECOND_TURN_STUB);
    try {
      const provider = new AgentSkillEvalsProvider({
        config: { adapter: "codex-json", command: "node", args: [agent, "-"], baseDir: dir },
      });
      const response = await provider.callApi("first", {
        vars: {
          fixture,
          conversation: { userTurns: ["second", "third"] },
        },
      });

      expect(response.error).toMatch(/exited 1/);
      expect(response.error).toMatch(/boom: turn 2 failure/);

      // The loop stopped after the failing turn: only turns 1 and 2 ran, the
      // scripted "third" turn never fired.
      const evidence = readEvidence(response.metadata?.evidencePath);
      const turns = evidence.turns ?? [];
      expect(turns.map((t) => `${t.turn}:${t.role}`)).toEqual([
        "1:user", "1:agent", "2:user", "2:agent",
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("truncates the replay prompt when maxTranscriptChars is small", async () => {
    const { dir, fixture, agent } = makeDir();
    try {
      const provider = new AgentSkillEvalsProvider({
        config: { adapter: "codex-json", command: "node", args: [agent, "-"], baseDir: dir },
      });
      const response = await provider.callApi("first", {
        vars: {
          fixture,
          conversation: { userTurns: ["second"], maxTranscriptChars: 10 },
        },
      });

      expect(response.error).toBeUndefined();
      const evidence = readEvidence(response.metadata?.evidencePath);
      const turns = evidence.turns ?? [];
      // Turn 2's agent reply echoes the full replay prompt it received; the
      // transcript-so-far section must have been truncated to fit maxTranscriptChars.
      expect(turns[3]?.text).toContain("[earlier conversation truncated]");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("simulated-user conversations", () => {
  it("drives turns from the simulated user and stops on the sentinel", async () => {
    const { dir, fixture, agent } = makeDir();
    const simUser = join(dir, "sim-user.mjs");
    writeFileSync(simUser, SIM_USER_STUB);
    try {
      const provider = new AgentSkillEvalsProvider({
        config: {
          adapter: "codex-json",
          command: "node",
          args: [agent, "-"],
          baseDir: dir,
          simulatedUser: { adapter: "codex-json", command: "node", args: [simUser, "-"] },
        },
      });
      const response = await provider.callApi("start the task", {
        vars: {
          fixture,
          conversation: { maxTurns: 5, user: { goal: "get the task refined", persona: "friction" } },
        },
      });

      expect(response.error).toBeUndefined();
      const evidence = readEvidence(response.metadata?.evidencePath);
      const turns = evidence.turns ?? [];

      // Turn 1 from the initial prompt, turn 2 from the simulated user, then
      // the sentinel ends the conversation before maxTurns.
      expect(turns.filter((t) => t.role === "agent")).toHaveLength(2);
      expect(turns[2]?.text).toBe("add more tests");

      // The simulated user's tool calls never enter run evidence.
      expect(evidence.toolCalls.every((t) => t.tool === "Edit")).toBe(true);
      expect(evidence.toolCalls).toHaveLength(2);

      // The simulated user ran sandboxed in its own directory.
      const runDir = (response.metadata as { runDir: string }).runDir;
      expect(existsSync(join(runDir, "simulated-user", "counter"))).toBe(true);
      expect(existsSync(join(dir, "counter"))).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("defaults the simulated user to the agent's own CLI", async () => {
    const { dir, fixture } = makeDir();
    // One stub serves both roles: as sim user it sees the role-play prompt
    // and answers <<DONE>> immediately, so the run is a single agent turn.
    const dual = join(dir, "dual.mjs");
    writeFileSync(
      dual,
      [
        'const prompt = process.argv[2] ?? "";',
        'const reply = prompt.includes("role-playing a HUMAN USER") ? "<<DONE>>" : "did:" + prompt;',
        'console.log(JSON.stringify({ type: "agent_message", message: reply }));',
      ].join("\n"),
    );
    try {
      const provider = new AgentSkillEvalsProvider({
        config: { adapter: "codex-json", command: "node", args: [dual, "-"], baseDir: dir },
      });
      const response = await provider.callApi("fix it", {
        vars: {
          fixture,
          conversation: { user: { goal: "done quickly" } },
        },
      });
      expect(response.error).toBeUndefined();
      const evidence = readEvidence(response.metadata?.evidencePath);
      expect((evidence.turns ?? []).filter((t) => t.role === "agent")).toHaveLength(1);
      expect(response.output).toBe("did:fix it");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("decodeConversationSpec", () => {
  it("requires scripted or simulated user input", () => {
    expect(decodeConversationSpec({ maxTurns: 3 })).toMatchObject({
      error: expect.stringContaining("requires userTurns"),
    });
  });

  it("explains malformed specs plainly", () => {
    expect(decodeConversationSpec({ userTurns: "nope" })).toMatchObject({
      error: expect.stringContaining("could not be read"),
    });
  });
});
