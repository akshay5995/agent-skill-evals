import { describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  claudeCodeJsonAdapter,
  codexJsonAdapter,
  handleClaudeEvent,
  handleCodexEvent,
  handlePiEvent,
  internalTestJsonAdapter,
  piJsonAdapter,
  type Adapter,
  type AdapterRunInput,
} from "../adapters.js";
import { ProcessRunnerLive } from "../command-runner.js";
import { EvidenceCollector } from "../evidence.js";
import { parseJsonlChunks } from "../jsonl-stream.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function runAdapter(adapter: Adapter, input: AdapterRunInput) {
  return Effect.runPromise(adapter.run(input).pipe(Effect.provide(ProcessRunnerLive)));
}

describe("JSONL stream parsing", () => {
  it("preserves event order, skips invalid JSON, and parses a final leftover line", () => {
    expect(parseJsonlChunks([
      "{\"type\":\"first\"}\nnot json\n{\"type\"",
      ":\"second\"}\n{\"type\":\"third\"}",
    ])).toEqual([
      { type: "first" },
      { type: "second" },
      { type: "third" },
    ]);
  });
});

function replayJsonl(
  fixtureName: string,
  handler: (evt: unknown, evidence: EvidenceCollector, appendFinal: (s: string) => void) => void,
): { output: string; evidence: EvidenceCollector } {
  const evidence = new EvidenceCollector();
  let output = "";
  const raw = readFileSync(join(fixturesDir, fixtureName), "utf8");
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    handler(JSON.parse(line), evidence, (text) => (output += text));
  }
  return { output, evidence };
}

describe("codex-json adapter", () => {
  it("projects Codex JSONL events into final output and evidence", () => {
    const evidence = new EvidenceCollector();
    let output = "";
    handleCodexEvent({ type: "agent_message", message: "done" }, evidence, (s) => (output += s));
    handleCodexEvent({ type: "tool_call", tool: "Edit", input: { path: "app.js" } }, evidence, () => {});
    handleCodexEvent({ type: "exec_command", command: "node", args: ["app.js"], exitCode: 0, stdout: "ok" }, evidence, () => {});
    handleCodexEvent({ type: "usage", usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 } }, evidence, () => {});

    const snapshot = evidence.toSnapshot();
    expect(output).toBe("done");
    expect(snapshot.toolCalls).toMatchObject([{ tool: "Edit", args: { path: "app.js" } }]);
    expect(snapshot.commands).toMatchObject([{ command: "node", args: ["app.js"], exitCode: 0 }]);
    expect(snapshot.usage.totalTokens).toBe(5);
  });

  it("normalizes captured Codex JSONL into Core Evidence", () => {
    const { output, evidence } = replayJsonl("codex-jsonl.jsonl", handleCodexEvent);
    const snapshot = evidence.toSnapshot();
    expect(output).toBe("patched app.js");
    expect(snapshot.toolCalls).toMatchObject([
      {
        tool: "Edit",
        provider: "codex-json",
        args: { path: "app.js" },
        result: "ok",
      },
    ]);
    expect(snapshot.commands).toMatchObject([
      {
        command: "./verify_login_redirect.sh",
        args: [],
        exitCode: 0,
        stdout: "ok\n",
      },
    ]);
    expect(snapshot.usage).toMatchObject({
      inputTokens: 11,
      outputTokens: 7,
      totalTokens: 18,
      cacheReadTokens: 3,
    });
  });

  it("captures Codex MCP tool calls with server and arguments", () => {
    const evidence = new EvidenceCollector();
    handleCodexEvent(
      {
        type: "item.completed",
        item: {
          type: "mcp_tool_call",
          server: "agent_skill_evals",
          tool: "read_mcp_resource",
          arguments: {
            server: "agent_skill_evals",
            uri: "skill://brand-deck/SKILL.md",
          },
          result: "ok",
        },
      },
      evidence,
      () => {},
    );

    const snapshot = evidence.toSnapshot();
    expect(snapshot.toolCalls).toMatchObject([
      {
        tool: "read_mcp_resource",
        provider: "codex-json",
        server: "agent_skill_evals",
        args: {
          server: "agent_skill_evals",
          uri: "skill://brand-deck/SKILL.md",
        },
      },
    ]);
    expect(snapshot.skillsLoaded).toMatchObject([
      {
        skill: "brand-deck",
        delivery: "mcp",
        provider: "codex-json",
        server: "agent_skill_evals",
        source: "read_mcp_resource",
      },
    ]);
  });

  it("maps Codex MCP resource calls when arguments are JSON strings", () => {
    const evidence = new EvidenceCollector();
    handleCodexEvent(
      {
        type: "item.completed",
        item: {
          type: "mcp_tool_call",
          server: "agent_skill_evals",
          tool: "read_mcp_resource",
          arguments: JSON.stringify({
            server: "agent_skill_evals",
            uri: "skill://brand-deck/SKILL.md",
          }),
          result: "ok",
        },
      },
      evidence,
      () => {},
    );

    const snapshot = evidence.toSnapshot();
    expect(snapshot.toolCalls[0]?.args).toEqual({
      server: "agent_skill_evals",
      uri: "skill://brand-deck/SKILL.md",
    });
    expect(snapshot.skillsLoaded).toMatchObject([
      {
        skill: "brand-deck",
        delivery: "mcp",
        provider: "codex-json",
        server: "agent_skill_evals",
        source: "read_mcp_resource",
      },
    ]);
  });

  it("returns a clear failure when the Codex command cannot start", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    try {
      const r = await runAdapter(codexJsonAdapter, {
        command: join(dir, "missing-codex"),
        args: ["exec", "--json"],
        cwd: dir,
        prompt: "hello",
        evidence: new EvidenceCollector(),
      });
      expect(r.exitCode).toBe(-1);
      expect(r.output).toMatch(/failed to start/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("surfaces non-zero exits with stderr", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "fail.mjs");
    writeFileSync(path, "console.error('auth missing'); process.exit(2);\n");
    try {
      const r = await runAdapter(codexJsonAdapter, {
        command: "node",
        args: [path],
        cwd: dir,
        prompt: "hello",
        evidence: new EvidenceCollector(),
      });
      expect(r.exitCode).toBe(2);
      expect(r.output).toMatch(/auth missing/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps partial output but still reports non-zero process health", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "partial-fail.mjs");
    writeFileSync(
      path,
      [
        "console.log(JSON.stringify({ type: 'agent_message', message: 'partial answer' }));",
        "console.error('auth expired');",
        "process.exit(2);",
      ].join("\n"),
    );
    try {
      const r = await runAdapter(codexJsonAdapter, {
        command: "node",
        args: [path],
        cwd: dir,
        prompt: "hello",
        evidence: new EvidenceCollector(),
      });
      expect(r.output).toBe("partial answer");
      expect(r.exitCode).toBe(2);
      expect(r.error).toMatch(/auth expired/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("returns a clear timeout when the agent command does not exit", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "hang.mjs");
    writeFileSync(path, "setInterval(() => {}, 1000);\n");
    try {
      const r = await runAdapter(codexJsonAdapter, {
        command: "node",
        args: [path],
        cwd: dir,
        prompt: "hello",
        evidence: new EvidenceCollector(),
        timeoutMs: 50,
      });
      expect(r.exitCode).toBe(-1);
      expect(r.output).toContain("timed out after 50ms");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("delivers the Codex prompt as an argv prompt instead of stdin", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "codex-argv.mjs");
    writeFileSync(
      path,
      [
        "process.stdin.resume();",
        "process.stdin.on('data', () => process.exit(9));",
        "console.log(JSON.stringify({ type: 'agent_message', message: process.argv.at(-1) }));",
      ].join("\n"),
    );
    try {
      const r = await runAdapter(codexJsonAdapter, {
        command: "node",
        args: [path, "--json", "-"],
        cwd: dir,
        prompt: "hello argv",
        evidence: new EvidenceCollector(),
      });
      expect(r.output).toBe("hello argv");
      expect(r.exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("normalizes absolute Codex file_change paths to fixture-relative tool args", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "codex-file-change.mjs");
    writeFileSync(
      path,
      [
        "const cwd = process.cwd();",
        "const absolutePath = `${cwd.startsWith('/private/') ? '' : '/private'}${cwd}/app.js`;",
        "console.log(JSON.stringify({ type: 'event', item: { type: 'file_change', changes: [{ path: absolutePath, kind: 'update' }] } }));",
        "console.log(JSON.stringify({ type: 'agent_message', message: 'done' }));",
      ].join("\n"),
    );
    const evidence = new EvidenceCollector();
    try {
      const r = await runAdapter(codexJsonAdapter, {
        command: "node",
        args: [path, "--json", "-"],
        cwd: dir,
        prompt: "hello argv",
        evidence,
      });
      expect(r.output).toBe("done");
      expect(evidence.toSnapshot().toolCalls).toMatchObject([
        { tool: "Edit", args: { path: "app.js", kind: "update" } },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("claude-code-json adapter", () => {
  it("captures token usage from nested Claude assistant messages", () => {
    const evidence = new EvidenceCollector();
    handleClaudeEvent(
      {
        type: "assistant",
        message: {
          usage: {
            input_tokens: 10,
            output_tokens: 4,
            cache_read_input_tokens: 2,
            cache_creation_input_tokens: 1,
          },
          content: [{ type: "text", text: "hello" }],
        },
      },
      evidence,
      () => {},
    );
    handleClaudeEvent(
      {
        type: "assistant",
        message: {
          usage: {
            input_tokens: 3,
            output_tokens: 5,
          },
          content: [],
        },
      },
      evidence,
      () => {},
    );

    expect(evidence.toSnapshot().usage).toMatchObject({
      inputTokens: 13,
      outputTokens: 9,
      totalTokens: 22,
      cacheReadTokens: 2,
      cacheWriteTokens: 1,
    });
  });

  it("normalizes captured Claude stream-json into Core Evidence", () => {
    const { output, evidence } = replayJsonl("claude-stream-json.jsonl", handleClaudeEvent);
    const snapshot = evidence.toSnapshot();
    expect(output).toBe("I'll patch the redirect.patched app.js");
    expect(snapshot.toolCalls).toMatchObject([
      {
        tool: "Edit",
        provider: "claude-code-json",
        args: { file_path: "app.js" },
      },
      {
        tool: "Bash",
        provider: "claude-code-json",
        args: { command: "./verify_login_redirect.sh" },
      },
    ]);
    expect(snapshot.usage).toMatchObject({
      inputTokens: 13,
      outputTokens: 8,
      totalTokens: 21,
      cacheReadTokens: 2,
      cacheWriteTokens: 1,
    });
  });

  it("records the adapter process command while replaying Claude JSONL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "claude-stream.mjs");
    writeFileSync(
      path,
      [
        "console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: 'app.js' } }] } }));",
        "console.log(JSON.stringify({ type: 'result', result: 'done', usage: { input_tokens: 1, output_tokens: 2 } }));",
      ].join("\n"),
    );
    const evidence = new EvidenceCollector();
    try {
      const r = await runAdapter(claudeCodeJsonAdapter, {
        command: "node",
        args: [path],
        cwd: dir,
        prompt: "hello",
        evidence,
      });
      expect(r.output).toBe("done");
      expect(evidence.toSnapshot().toolCalls).toMatchObject([
        { tool: "Edit", provider: "claude-code-json" },
      ]);
      expect(evidence.toSnapshot().commands).toMatchObject([
        { command: "node", args: [path], exitCode: 0 },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("normalizes Claude MCP tool names into server and tool evidence", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "claude-mcp-stream.mjs");
    writeFileSync(
      path,
      "console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'mcp__agent_skill_evals__skill_brand_deck', input: {} }] } }));\n",
    );
    const evidence = new EvidenceCollector();
    try {
      await runAdapter(claudeCodeJsonAdapter, {
        command: "node",
        args: [path],
        cwd: dir,
        prompt: "hello",
        evidence,
      });
      expect(evidence.toSnapshot().toolCalls).toMatchObject([
        {
          tool: "skill_brand_deck",
          provider: "claude-code-json",
          server: "agent_skill_evals",
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("maps Claude MCP resource reads into loaded skill evidence", () => {
    const evidence = new EvidenceCollector();
    handleClaudeEvent(
      {
        type: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "ReadMcpResourceTool",
              input: {
                server: "agent_skill_evals",
                uri: "skill://brand-deck/SKILL.md",
              },
            },
          ],
        },
      },
      evidence,
      () => {},
    );

    expect(evidence.toSnapshot().skillsLoaded).toMatchObject([
      {
        skill: "brand-deck",
        delivery: "mcp",
        provider: "claude-code-json",
        server: "agent_skill_evals",
        source: "ReadMcpResourceTool",
      },
    ]);
  });

  it("maps custom MCP resource-read argument shapes into loaded skill evidence", () => {
    const evidence = new EvidenceCollector({
      mcpResource: {
        uriArgPaths: ["resource.uri"],
        uriPatterns: ["^skill://(?<skill>[^/]+)/content$"],
      },
    });
    evidence.addToolCall({
      tool: "custom_read_resource",
      provider: "custom-json",
      args: {
        resource: {
          uri: "skill://brand-deck/content",
        },
      },
      startedAt: 1,
      durationMs: 0,
    });

    expect(evidence.toSnapshot().skillsLoaded).toMatchObject([
      {
        skill: "brand-deck",
        delivery: "mcp",
        provider: "custom-json",
        source: "custom_read_resource",
      },
    ]);
  });

  it("maps MCP skill loader tools into loaded skill evidence", () => {
    const evidence = new EvidenceCollector();
    evidence.addToolCall({
      tool: "load_brand_deck_skill",
      provider: "claude-code-json",
      server: "agent_skill_evals",
      args: {},
      result: "# brand-deck",
      startedAt: 1,
      durationMs: 2,
    });

    expect(evidence.toSnapshot().skillsLoaded).toMatchObject([
      {
        skill: "brand-deck",
        delivery: "mcp",
        provider: "claude-code-json",
        server: "agent_skill_evals",
        source: "load_brand_deck_skill",
      },
    ]);
  });

  it("maps custom MCP skill loader tool names into loaded skill evidence", () => {
    const evidence = new EvidenceCollector({
      mcpTool: {
        toolPatterns: ["^agent_skill_evals_load_(?<skill>[A-Za-z0-9_-]+)$"],
      },
    });
    evidence.addToolCall({
      tool: "agent_skill_evals_load_brand-deck",
      provider: "custom-json",
      args: {},
      startedAt: 1,
      durationMs: 2,
    });

    expect(evidence.toSnapshot().skillsLoaded).toMatchObject([
      {
        skill: "brand-deck",
        delivery: "mcp",
        provider: "custom-json",
        source: "agent_skill_evals_load_brand-deck",
      },
    ]);
  });

  it("normalizes Claude absolute file_path args to fixture-relative path", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "claude-stream.mjs");
    writeFileSync(
      path,
      `console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Edit', input: { file_path: '${join(dir, "app.js")}' } }] } }));`,
    );
    const evidence = new EvidenceCollector();
    try {
      await runAdapter(claudeCodeJsonAdapter, {
        command: "node",
        args: [path],
        cwd: dir,
        prompt: "hello",
        evidence,
      });
      expect(evidence.toSnapshot().toolCalls).toMatchObject([
        {
          tool: "Edit",
          provider: "claude-code-json",
          args: { file_path: "app.js", path: "app.js" },
        },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("pi-json adapter", () => {
  it("captures token usage from Pi message events", () => {
    const evidence = new EvidenceCollector();
    handlePiEvent(
      {
        type: "message_end",
        message: {
          role: "assistant",
          usage: {
            input: 2243,
            output: 2,
            cacheRead: 7,
            cacheWrite: 11,
            totalTokens: 2245,
          },
        },
      },
      evidence,
      () => {},
    );
    handlePiEvent(
      {
        type: "turn_end",
        message: {
          role: "assistant",
          usage: {
            input: 2243,
            output: 2,
            cacheRead: 7,
            cacheWrite: 11,
            totalTokens: 2245,
          },
        },
      },
      evidence,
      () => {},
    );

    expect(evidence.toSnapshot().usage).toMatchObject({
      inputTokens: 2243,
      outputTokens: 2,
      totalTokens: 2245,
      cacheReadTokens: 7,
      cacheWriteTokens: 11,
    });
  });

  it("normalizes captured Pi JSON events into Core Evidence", () => {
    const { output, evidence } = replayJsonl("pi-json.jsonl", handlePiEvent);
    const snapshot = evidence.toSnapshot();
    expect(output).toBe("patched app.js");
    expect(snapshot.toolCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tool: "Edit",
        provider: "pi-json",
        args: { path: "app.js" },
      }),
      expect.objectContaining({
        tool: "Bash",
        provider: "pi-json",
        args: { command: "./verify_login_redirect.sh" },
      }),
      expect.objectContaining({
        tool: "Bash",
        provider: "pi-json",
        result: "ok\n",
      }),
    ]));
    expect(snapshot.commands).toMatchObject([
      {
        command: "./verify_login_redirect.sh",
        args: [],
        exitCode: 0,
        stdout: "ok\n",
      },
    ]);
    expect(snapshot.usage).toMatchObject({
      inputTokens: 17,
      outputTokens: 9,
      totalTokens: 26,
    });
  });

  it("normalizes lower-case Pi tool names and keeps start-event args", () => {
    const evidence = new EvidenceCollector();
    handlePiEvent(
      { type: "tool_execution_start", tool: "edit", args: { path: "app.js" } },
      evidence,
      () => {},
    );
    handlePiEvent(
      { type: "tool_execution_end", tool: "edit", output: "ok" },
      evidence,
      () => {},
    );

    expect(evidence.toSnapshot().toolCalls).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tool: "Edit",
        provider: "pi-json",
        args: { path: "app.js" },
      }),
      expect.objectContaining({
        tool: "Edit",
        provider: "pi-json",
        result: "ok",
      }),
    ]));
  });

  it("records the adapter process command while replaying Pi JSONL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "pi-json.mjs");
    writeFileSync(
      path,
      [
        "console.log(JSON.stringify({ type: 'tool_execution_end', tool: 'Edit', args: { path: 'app.js' } }));",
        "console.log(JSON.stringify({ type: 'final', text: 'done' }));",
      ].join("\n"),
    );
    const evidence = new EvidenceCollector();
    try {
      const r = await runAdapter(piJsonAdapter, {
        command: "node",
        args: [path],
        cwd: dir,
        prompt: "hello",
        evidence,
      });
      expect(r.output).toBe("done");
      expect(evidence.toSnapshot().toolCalls).toMatchObject([
        { tool: "Edit", provider: "pi-json" },
      ]);
      expect(evidence.toSnapshot().commands).toMatchObject([
        { command: "node", args: [path], exitCode: 0 },
      ]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("internal-test-json adapter", () => {
  it("uses deterministic JSON events without documenting another supported agent", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "agent.mjs");
    writeFileSync(path, "console.log(JSON.stringify({ type: 'agent_message', message: 'ok' }));\n");
    try {
      const r = await runAdapter(internalTestJsonAdapter, {
        command: "node",
        args: [path],
        cwd: dir,
        prompt: "hello",
        evidence: new EvidenceCollector(),
      });
      expect(r.output).toBe("ok");
      expect(r.exitCode).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
