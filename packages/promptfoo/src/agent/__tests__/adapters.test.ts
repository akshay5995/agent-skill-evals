import { describe, expect, it } from "vitest";
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
  piJsonAdapter,
  type Adapter,
  type AdapterRunInput,
} from "../adapters.js";
import { EvidenceCollector } from "../evidence.js";
import { parseJsonlChunks } from "../jsonl-stream.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function runAdapter(adapter: Adapter, input: AdapterRunInput) {
  return adapter.run(input);
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

  it("records a Codex command once across started and completed lifecycle events", () => {
    const evidence = new EvidenceCollector();
    const item = { type: "command_execution", command: "pnpm test", exit_code: 0 };
    handleCodexEvent({ type: "item.started", item }, evidence, () => {});
    handleCodexEvent({ type: "item.completed", item }, evidence, () => {});

    expect(evidence.toSnapshot().commands).toMatchObject([
      { command: "pnpm test", exitCode: 0 },
    ]);
  });

  it("records a Codex file change once across started and completed lifecycle events", () => {
    const evidence = new EvidenceCollector();
    const item = { type: "file_change", changes: [{ path: "CHANGELOG.md", kind: "add" }] };
    handleCodexEvent({ type: "item.started", item }, evidence, () => {});
    handleCodexEvent({ type: "item.completed", item }, evidence, () => {});

    expect(evidence.toSnapshot().toolCalls).toMatchObject([
      { tool: "Edit", args: { path: "CHANGELOG.md", kind: "add" } },
    ]);
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
    expect(output).toBe("patched app.js");
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

  it("explains how to authenticate Claude inside the isolated HOME", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "claude-auth.mjs");
    writeFileSync(
      path,
      [
        "console.log(JSON.stringify({ type: 'result', result: 'Not logged in · Please run /login' }));",
        "process.exitCode = 1;",
      ].join("\n"),
    );
    const evidence = new EvidenceCollector();
    try {
      const result = await runAdapter(claudeCodeJsonAdapter, {
        command: "node",
        args: [path],
        cwd: dir,
        prompt: "hello",
        evidence,
      });
      expect(result.output).toContain("CLAUDE_CODE_OAUTH_TOKEN");
      expect(result.error).toContain("isolated HOME");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("accepts Claude rate-limit telemetry without an adapter-drift warning", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "claude-rate-limit.mjs");
    writeFileSync(
      path,
      [
        "console.log(JSON.stringify({ type: 'rate_limit_event', rate_limit_info: { status: 'allowed' } }));",
        "console.log(JSON.stringify({ type: 'result', result: 'done' }));",
      ].join("\n"),
    );
    const evidence = new EvidenceCollector();
    try {
      const result = await runAdapter(claudeCodeJsonAdapter, {
        command: "node",
        args: [path],
        cwd: dir,
        prompt: "hello",
        evidence,
      });
      expect(result.output).toBe("done");
      expect(evidence.toSnapshot().warnings).toBeUndefined();
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
  it("surfaces Pi provider authentication errors from nested messages", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "pi-auth.mjs");
    writeFileSync(
      path,
      "console.log(JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [], stopReason: 'error', errorMessage: 'No API key for provider: openai-codex' } }));\n",
    );
    try {
      const result = await runAdapter(piJsonAdapter, {
        command: "node",
        args: [path],
        cwd: dir,
        prompt: "hello",
        evidence: new EvidenceCollector(),
      });
      expect(result.output).toContain("No API key for provider");
      expect(result.error).toContain("Pi authentication failed");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not infer authentication failure from successful final prose", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "pi-prose.mjs");
    writeFileSync(
      path,
      "console.log(JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'The docs say No API key for provider.' }], stopReason: 'stop' } }));\n",
    );
    try {
      const result = await runAdapter(piJsonAdapter, {
        command: "node", args: [path], cwd: dir, prompt: "hello", evidence: new EvidenceCollector(),
      });
      expect(result.output).toBe("The docs say No API key for provider.");
      expect(result.error).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("uses every text block from only the final Pi assistant message", () => {
    const evidence = new EvidenceCollector();
    let output = "";
    const setOutput = (text: string, replace = false) => { output = replace ? text : output + text; };
    handlePiEvent(
      { type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "I will try an approach." }] } },
      evidence,
      setOutput,
    );
    handlePiEvent(
      {
        type: "message_end",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Patched app.js. " },
            { type: "text", text: "The verifier passes." },
          ],
        },
      },
      evidence,
      setOutput,
    );
    expect(output).toBe("Patched app.js. The verifier passes.");
  });

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
        result: "ok\n",
      }),
    ]));
    expect(snapshot.toolCalls.filter((call) => call.tool === "Bash")).toHaveLength(1);
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

    expect(evidence.toSnapshot().toolCalls).toEqual([
      expect.objectContaining({
        tool: "Edit",
        provider: "pi-json",
        args: { path: "app.js" },
        result: "ok",
      }),
    ]);
  });

  it("records the adapter process command while replaying Pi JSONL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-adapter-"));
    const path = join(dir, "pi-json.mjs");
    writeFileSync(
      path,
      [
        "console.log(JSON.stringify({ type: 'tool_execution_end', tool: 'Edit', args: { path: 'app.js' } }));",
        "console.log(JSON.stringify({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] } }));",
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
