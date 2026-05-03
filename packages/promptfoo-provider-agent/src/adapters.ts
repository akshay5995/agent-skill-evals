import { spawn } from "node:child_process";
import type { EvidenceCollector } from "./evidence.js";

export interface AdapterRunInput {
  command: string;
  args: readonly string[];
  cwd: string;
  prompt: string;
  evidence: EvidenceCollector;
  timeoutMs?: number;
}

export interface AdapterRunResult {
  output: string;
  exitCode: number;
  durationMs: number;
}

export interface Adapter {
  id: string;
  run(input: AdapterRunInput): Promise<AdapterRunResult>;
}

/**
 * Generic adapter: spawns the configured command, sends the prompt on stdin,
 * captures stdout as the agent's output. Suitable for stub agents and
 * deterministic test scripts.
 */
export const genericAdapter: Adapter = {
  id: "generic",
  async run({ command, args, cwd, prompt, evidence, timeoutMs }) {
    const startedAt = Date.now();
    return await new Promise<AdapterRunResult>((resolve) => {
      const child = spawn(command, [...args], { cwd });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.stdin.write(prompt);
      child.stdin.end();
      const timer = timeoutMs
        ? setTimeout(() => child.kill("SIGKILL"), timeoutMs)
        : null;
      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        const durationMs = Date.now() - startedAt;
        evidence.addCommand({
          command,
          args: [...args],
          exitCode: code ?? -1,
          stdout: stdout.slice(0, 4096),
          stderr: stderr.slice(0, 4096),
          startedAt,
          durationMs,
        });
        resolve({ output: stdout.trim(), exitCode: code ?? -1, durationMs });
      });
      child.on("error", (err) => {
        if (timer) clearTimeout(timer);
        resolve({
          output: `adapter error: ${String(err)}`,
          exitCode: -1,
          durationMs: Date.now() - startedAt,
        });
      });
    });
  },
};

/**
 * Claude Code stream-json adapter: parses stream-json events emitted by
 * `claude -p ... --output-format stream-json` and projects them into evidence.
 *
 * Events of interest (see Claude Code docs):
 *  - { type: "system" | "assistant" | "user" | "result", ... }
 *  - tool_use blocks inside assistant content (Bash, Edit, Write, etc.)
 */
export const claudeCodeJsonAdapter: Adapter = {
  id: "claude-code-json",
  async run({ command, args, cwd, prompt, evidence, timeoutMs }) {
    const startedAt = Date.now();
    return await new Promise<AdapterRunResult>((resolve) => {
      const child = spawn(command, [...args], { cwd });
      let stderr = "";
      let leftover = "";
      let finalText = "";

      child.stdout.on("data", (d) => {
        const lines = (leftover + d.toString()).split("\n");
        leftover = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let evt: unknown;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          handleEvent(evt, evidence, (text) => (finalText += text));
        }
      });
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.stdin.write(prompt);
      child.stdin.end();

      const timer = timeoutMs
        ? setTimeout(() => child.kill("SIGKILL"), timeoutMs)
        : null;
      child.on("close", (code) => {
        if (timer) clearTimeout(timer);
        const durationMs = Date.now() - startedAt;
        evidence.addCommand({
          command,
          args: [...args],
          exitCode: code ?? -1,
          stderr: stderr.slice(0, 4096),
          startedAt,
          durationMs,
        });
        resolve({ output: finalText.trim(), exitCode: code ?? -1, durationMs });
      });
      child.on("error", (err) => {
        if (timer) clearTimeout(timer);
        resolve({
          output: `adapter error: ${String(err)}`,
          exitCode: -1,
          durationMs: Date.now() - startedAt,
        });
      });
    });
  },
};

function handleEvent(
  evt: unknown,
  evidence: EvidenceCollector,
  appendFinal: (s: string) => void,
): void {
  if (!evt || typeof evt !== "object") return;
  const e = evt as { type?: string; message?: unknown; result?: unknown; usage?: unknown };
  if (e.type === "result" && typeof e.result === "string") {
    appendFinal(e.result);
  }
  if (e.type === "assistant" && e.message && typeof e.message === "object") {
    const msg = e.message as { content?: unknown };
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (!block || typeof block !== "object") continue;
        const b = block as { type?: string; text?: string; name?: string; input?: unknown };
        if (b.type === "text" && typeof b.text === "string") {
          appendFinal(b.text);
        }
        if (b.type === "tool_use" && typeof b.name === "string") {
          evidence.addToolCall({
            tool: b.name,
            args: b.input,
            startedAt: Date.now(),
            durationMs: 0,
          });
        }
      }
    }
  }
  if (e.type === "result" && e.usage && typeof e.usage === "object") {
    const u = e.usage as Record<string, number>;
    evidence.setUsage({
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      totalTokens:
        (u.input_tokens ?? 0) + (u.output_tokens ?? 0) || undefined,
      cacheReadTokens: u.cache_read_input_tokens,
      cacheWriteTokens: u.cache_creation_input_tokens,
    });
  }
}

export const adapterRegistry: Map<string, Adapter> = new Map([
  [genericAdapter.id, genericAdapter],
  [claudeCodeJsonAdapter.id, claudeCodeJsonAdapter],
]);
