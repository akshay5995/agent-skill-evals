import { isAbsolute, relative } from "node:path";
import type { EvidenceCollector } from "./evidence.js";
import type { CommandEvent, ToolCallEvent, Usage } from "../internal-types.js";
import { runCommand } from "./command-runner.js";
import { createJsonlEventParser } from "./jsonl-stream.js";

export interface AdapterRunInput {
  command: string;
  args: readonly string[];
  cwd: string;
  prompt: string;
  evidence: EvidenceCollector;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
}

export interface AdapterRunResult {
  output: string;
  exitCode: number;
  timedOut: boolean;
  error?: string;
  durationMs: number;
}

export interface Adapter {
  id: string;
  run(input: AdapterRunInput): Promise<AdapterRunResult>;
}

interface JsonlAdapterOptions {
  promptDelivery?: "stdin" | "arg";
  adapterId?: string;
  terminalError?: (event: unknown) => string | undefined;
}

interface EvidenceSink {
  addCommand(e: CommandEvent): void;
  addToolCall(e: ToolCallEvent): void;
  setUsage(u: Usage): void;
  addUsage(u: Usage): void;
  setModel?(model: string): void;
  now?: () => number;
}

const pendingPiToolCalls = new WeakMap<EvidenceSink, ToolCallEvent[]>();

/**
 * Event handlers return true when they recognize the event's type — consumed
 * or deliberately ignored. Unrecognized types are counted per run and
 * surfaced as an evidence warning: CLIs change their output schemas without
 * notice, and a silent parse miss would otherwise corrupt evidence.
 */
type EventHandler = (
  evt: unknown,
  evidence: EvidenceSink,
  appendFinal: (s: string, replace?: boolean) => void,
) => boolean;

function argsWithPrompt(args: readonly string[], prompt: string): string[] {
  const dashIndex = args.lastIndexOf("-");
  if (dashIndex === -1) return [...args, prompt];
  return args.map((arg, index) => (index === dashIndex ? prompt : arg));
}

function normalizePathFromCwd(path: string, cwd: string): string {
  if (!isAbsolute(path)) return path;
  const candidate = path.startsWith("/private/") ? path.slice("/private".length) : path;
  const base = cwd.startsWith("/private/") ? cwd.slice("/private".length) : cwd;
  const rel = relative(base, candidate);
  return rel && !rel.startsWith("..") && !isAbsolute(rel) ? rel : path;
}

function normalizeToolCallArgs(args: unknown, cwd: string): unknown {
  if (!args || typeof args !== "object" || Array.isArray(args)) return args;
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    const pathLike = (key === "path" || key === "file_path") && typeof value === "string";
    const normalizedValue = pathLike ? normalizePathFromCwd(value, cwd) : value;
    normalized[key] = normalizedValue;
    if (key === "file_path" && typeof normalizedValue === "string" && normalized.path === undefined) {
      normalized.path = normalizedValue;
    }
  }
  return normalized;
}

function normalizeMcpToolCall(event: ToolCallEvent): ToolCallEvent {
  const match = /^mcp__(.+?)__(.+)$/.exec(event.tool);
  if (!match) return event;
  return {
    ...event,
    server: event.server ?? match[1],
    tool: match[2] ?? event.tool,
  };
}

function parseJsonObjectString(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" ? parsed : value;
  } catch {
    return value;
  }
}

function evidenceWithRelativeToolPaths(
  evidence: EvidenceCollector,
  cwd: string,
  now: () => number,
): EvidenceSink {
  return {
    addCommand: (event) => evidence.addCommand(event),
    addToolCall: (event) => {
      const normalized = normalizeMcpToolCall(event);
      evidence.addToolCall({
        ...normalized,
        args: normalizeToolCallArgs(normalized.args, cwd),
      });
    },
    setUsage: (usage) => evidence.setUsage(usage),
    addUsage: (usage) => evidence.addUsage(usage),
    setModel: (model) => evidence.mergeRuntime({ model }),
    now,
  };
}

function normalizeUsage(usage: Record<string, number>): Usage {
  const inputTokens = usage.input_tokens ?? usage.inputTokens ?? usage.input;
  const outputTokens = usage.output_tokens ?? usage.outputTokens ?? usage.output;
  const cacheReadTokens =
    usage.cache_read_input_tokens ?? usage.cacheReadTokens ?? usage.cacheRead;
  const cacheWriteTokens =
    usage.cache_creation_input_tokens ?? usage.cacheWriteTokens ?? usage.cacheWrite;
  return {
    inputTokens,
    outputTokens,
    totalTokens:
      usage.total_tokens ??
      usage.totalTokens ??
      addKnownNumbers(inputTokens, outputTokens),
    cacheReadTokens,
    cacheWriteTokens,
  };
}

function addKnownNumbers(...values: Array<number | undefined>): number | undefined {
  const present = values.filter((value): value is number => typeof value === "number");
  return present.length > 0 ? present.reduce((sum, value) => sum + value, 0) : undefined;
}

function normalizePiToolName(tool: string): string {
  switch (tool.toLowerCase()) {
    case "bash":
      return "Bash";
    case "edit":
      return "Edit";
    case "read":
      return "Read";
    case "write":
      return "Write";
    default:
      return tool;
  }
}

function evidenceStartedAt(evidence: EvidenceSink): number {
  return evidence.now?.() ?? 0;
}

async function runJsonlAdapter(
  input: AdapterRunInput,
  onEvent: EventHandler,
  options: JsonlAdapterOptions = {},
): Promise<AdapterRunResult> {
  const { command, args, cwd, prompt, evidence, timeoutMs, env } = input;
  const promptDelivery = options.promptDelivery ?? "stdin";
  const spawnArgs = promptDelivery === "arg" ? argsWithPrompt(args, prompt) : [...args];
  const runStartedAt = Date.now();
  const adapterEvidence = evidenceWithRelativeToolPaths(evidence, cwd, () => runStartedAt);
  const parser = createJsonlEventParser();
  const unrecognized = new Map<string, number>();
  let finalText = "";
  let terminalError: string | undefined;
  const dispatch = (evt: unknown) => {
    terminalError = options.terminalError?.(evt) ?? terminalError;
    const recognized = onEvent(evt, adapterEvidence, (text, replace = false) => {
      finalText = replace ? text : finalText + text;
    });
    if (recognized) return;
    const type =
      evt && typeof evt === "object" && typeof (evt as { type?: unknown }).type === "string"
        ? (evt as { type: string }).type
        : "<no type>";
    unrecognized.set(type, (unrecognized.get(type) ?? 0) + 1);
  };
  const handleChunk = (chunk: string) => {
    for (const evt of parser.push(chunk)) {
      dispatch(evt);
    }
  };

  const result = await runCommand(command, spawnArgs, {
    cwd,
    env,
    stdin: promptDelivery === "stdin" ? prompt : undefined,
    timeoutMs,
    stdoutLimit: 0,
    onStdout: handleChunk,
  });

  for (const evt of parser.finish()) {
    dispatch(evt);
  }
  if (unrecognized.size > 0) {
    const summary = [...unrecognized.entries()]
      .map(([type, count]) => `${type} (${count})`)
      .join(", ");
    evidence.addWarning(
      `${options.adapterId ?? "adapter"}: unrecognized event type(s) in CLI output: ${summary}. ` +
        "The CLI's JSON schema may have changed since this adapter was written; " +
        "recorded evidence may be incomplete.",
    );
  }
  evidence.addCommand({
    command,
    args: [...spawnArgs],
    exitCode: result.exitCode,
    stderr: result.stderr.slice(0, 4096),
    startedAt: result.startedAt,
    durationMs: result.durationMs,
  });
  const error = result.error
    ? `adapter error: failed to start "${command}": ${result.error.message}`
    : result.timedOut
      ? `${command} timed out after ${timeoutMs ?? 0}ms`
      : result.exitCode !== 0
        ? `${command} exited ${result.exitCode}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ""}`
        : terminalError;
  if (error && !finalText.trim()) finalText = error;
  return {
    output: finalText.trim(),
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    ...(error ? { error } : {}),
    durationMs: result.durationMs,
  };
}

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
  async run(input) {
    const result = await runJsonlAdapter(input, handleClaudeEvent, { adapterId: "claude-code-json" });
    if (result.exitCode !== 0 && /not logged in/i.test(result.output)) {
      const hint =
        "Claude Code runs with an isolated HOME and cannot reuse a macOS Keychain login. " +
        "Set CLAUDE_CODE_OAUTH_TOKEN (created by `claude setup-token`) or ANTHROPIC_API_KEY.";
      return {
        ...result,
        output: `${result.output}\n\n${hint}`,
        error: `${result.error ?? "Claude Code authentication failed"}. ${hint}`,
      };
    }
    return result;
  },
};

export const codexJsonAdapter: Adapter = {
  id: "codex-json",
  run(input) {
    return runJsonlAdapter(input, handleCodexEvent, {
      promptDelivery: "arg",
      adapterId: "codex-json",
    });
  },
};

export const piJsonAdapter: Adapter = {
  id: "pi-json",
  async run(input) {
    const result = await runJsonlAdapter(input, handlePiEvent, {
      adapterId: "pi-json",
      terminalError: piTerminalError,
    });
    if (result.error && /no api key for provider/i.test(result.error)) {
      return {
        ...result,
        error: `Pi authentication failed: ${result.error}`,
      };
    }
    return result;
  },
};

function piTerminalError(event: unknown): string | undefined {
  if (!event || typeof event !== "object") return undefined;
  const message = (event as { message?: unknown }).message;
  if (!message || typeof message !== "object") return undefined;
  const terminal = message as { stopReason?: unknown; errorMessage?: unknown };
  return terminal.stopReason === "error" && typeof terminal.errorMessage === "string"
    ? terminal.errorMessage
    : undefined;
}

/** Event types Claude Code's stream-json output is known to emit. */
const CLAUDE_KNOWN_EVENT_TYPES = new Set([
  "system",
  "assistant",
  "user",
  "result",
  "stream_event",
  "rate_limit_event",
]);

export function handleClaudeEvent(
  evt: unknown,
  evidence: EvidenceSink,
  appendFinal: (s: string, replace?: boolean) => void,
): boolean {
  if (!evt || typeof evt !== "object") return false;
  const e = evt as { type?: string; message?: unknown; result?: unknown; usage?: unknown; model?: unknown };
  if (e.type === "system" && typeof e.model === "string") {
    evidence.setModel?.(e.model);
  }
  if (e.type === "result" && typeof e.result === "string") {
    appendFinal(e.result);
  }
  if (e.type === "assistant" && e.message && typeof e.message === "object") {
    const msg = e.message as { content?: unknown; usage?: unknown; model?: unknown };
    if (typeof msg.model === "string") {
      evidence.setModel?.(msg.model);
    }
    if (msg.usage && typeof msg.usage === "object") {
      evidence.addUsage(normalizeUsage(msg.usage as Record<string, number>));
    }
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (!block || typeof block !== "object") continue;
        const b = block as { type?: string; text?: string; name?: string; input?: unknown };
        if (b.type === "tool_use" && typeof b.name === "string") {
          evidence.addToolCall({
            tool: b.name,
            provider: "claude-code-json",
            args: b.input,
            startedAt: evidenceStartedAt(evidence),
            durationMs: 0,
          });
        }
      }
    }
  }
  if (e.type === "result" && e.usage && typeof e.usage === "object") {
    evidence.setUsage(normalizeUsage(e.usage as Record<string, number>));
  }
  return typeof e.type === "string" && CLAUDE_KNOWN_EVENT_TYPES.has(e.type);
}

/**
 * Codex lifecycle event families that carry no evidence but are normal
 * output — recognized so they do not trigger schema-drift warnings.
 */
const CODEX_KNOWN_TYPE_PATTERN =
  /^(thread|turn|session|item|task|agent|token_count|notification|status|reasoning|error|usage)([._:]|$)/;

export function handleCodexEvent(
  evt: unknown,
  evidence: EvidenceSink,
  appendFinal: (s: string) => void,
): boolean {
  if (!evt || typeof evt !== "object") return false;
  const e = evt as Record<string, unknown>;
  const type = typeof e.type === "string" ? e.type : "";
  let consumed = false;

  if (typeof e.model === "string") {
    evidence.setModel?.(e.model);
  }

  const text =
    typeof e.message === "string" ? e.message :
    typeof e.text === "string" ? e.text :
    typeof e.content === "string" ? e.content :
    typeof e.output === "string" ? e.output :
    undefined;
  if (text && /message|final|result|response|output/.test(type)) {
    appendFinal(text);
    consumed = true;
  }

  const item = e.item && typeof e.item === "object" ? e.item as Record<string, unknown> : e;
  const itemType = typeof item.type === "string" ? item.type : "";
  const toolName =
    typeof item.tool === "string" ? item.tool :
    typeof item.name === "string" && /tool|call|command/.test(`${type}:${itemType}`) ? item.name :
    undefined;
  if (toolName && /tool|call|command/.test(`${type}:${itemType}`)) {
    evidence.addToolCall({
      tool: toolName,
      provider: "codex-json",
      server: typeof item.server === "string" ? item.server : undefined,
      args: parseJsonObjectString(item.args ?? item.input ?? item.arguments),
      result: item.result ?? item.output,
      startedAt: evidenceStartedAt(evidence),
      durationMs: 0,
    });
    consumed = true;
  }

  const completedFileChangeEvent = type === "file_change" || type === "event" || /(?:completed|failed|result)$/.test(type);
  if (completedFileChangeEvent && itemType === "file_change" && Array.isArray(item.changes)) {
    for (const change of item.changes) {
      if (!change || typeof change !== "object") continue;
      const c = change as { path?: unknown; kind?: unknown };
      if (typeof c.path !== "string") continue;
      evidence.addToolCall({
        tool: "Edit",
        provider: "codex-json",
        args: {
          path: c.path,
          kind: typeof c.kind === "string" ? c.kind : undefined,
        },
        startedAt: evidenceStartedAt(evidence),
        durationMs: 0,
      });
    }
    consumed = true;
  }

  const completedCommandEvent =
    type === "exec_command" ||
    /(?:completed|failed|result)$/.test(type);
  if (completedCommandEvent && (type.includes("exec") || type.includes("command") || itemType.includes("command")) && typeof item.command === "string") {
    const args = Array.isArray(item.args) ? item.args.map(String) : [];
    evidence.addCommand({
      command: item.command,
      args,
      exitCode: typeof item.exit_code === "number" ? item.exit_code : typeof item.exitCode === "number" ? item.exitCode : 0,
      stdout: typeof item.stdout === "string" ? item.stdout.slice(0, 4096) : typeof item.aggregated_output === "string" ? item.aggregated_output.slice(0, 4096) : undefined,
      stderr: typeof item.stderr === "string" ? item.stderr.slice(0, 4096) : undefined,
      startedAt: evidenceStartedAt(evidence),
      durationMs: typeof item.durationMs === "number" ? item.durationMs : 0,
    });
    consumed = true;
  }

  const usage = e.usage && typeof e.usage === "object" ? e.usage as Record<string, number> : undefined;
  if (usage) {
    evidence.setUsage(normalizeUsage(usage));
    consumed = true;
  }
  return consumed || CODEX_KNOWN_TYPE_PATTERN.test(type);
}

/** Pi lifecycle events that carry no evidence but are normal output. */
const PI_KNOWN_EVENT_TYPES = new Set([
  "message_start",
  "message_update",
  "message_end",
  "turn_start",
  "turn_end",
  "agent_start",
  "agent_end",
  "tool_execution_start",
  "tool_execution_update",
  "tool_execution_end",
  "session",
  "thinking",
  "usage",
  "final",
  "error",
]);

export function handlePiEvent(
  evt: unknown,
  evidence: EvidenceSink,
  appendFinal: (s: string, replace?: boolean) => void,
): boolean {
  if (!evt || typeof evt !== "object") return false;
  const e = evt as Record<string, unknown>;
  const type = typeof e.type === "string" ? e.type : "";
  let consumed = false;
  const message = e.message && typeof e.message === "object"
    ? e.message as Record<string, unknown>
    : undefined;
  if (typeof message?.model === "string") {
    evidence.setModel?.(message.model);
  }
  const messageUsage = message?.usage && typeof message.usage === "object"
    ? message.usage as Record<string, number>
    : undefined;
  if (messageUsage && (type === "message_end" || type === "turn_end" || type === "agent_end")) {
    evidence.setUsage(normalizeUsage(messageUsage));
    consumed = true;
  }

  if (type === "message_end" && message?.role === "assistant" && Array.isArray(message.content)) {
    let assistantText = "";
    for (const block of message.content) {
      if (!block || typeof block !== "object") continue;
      const content = block as { type?: unknown; text?: unknown };
      if (content.type === "text" && typeof content.text === "string") {
        assistantText += content.text;
      }
    }
    if (assistantText) {
      appendFinal(assistantText, true);
      consumed = true;
    }
    if (message.stopReason === "error" && typeof message.errorMessage === "string") {
      appendFinal(message.errorMessage, true);
      consumed = true;
    }
  }

  const text =
    typeof e.message === "string" ? e.message :
    typeof e.text === "string" ? e.text :
    typeof e.content === "string" ? e.content :
    typeof e.output === "string" ? e.output :
    typeof e.result === "string" ? e.result :
    undefined;
  if (text && /assistant|message|final|result|response|output/.test(type)) {
    appendFinal(text);
    consumed = true;
  }

  if (type === "tool_execution_start" || type === "tool_execution_end") {
    const rawTool =
      typeof e.tool === "string" ? e.tool :
      typeof e.name === "string" ? e.name :
      typeof e.tool_name === "string" ? e.tool_name :
      typeof e.toolName === "string" ? e.toolName :
      undefined;
    const tool = rawTool ? normalizePiToolName(rawTool) : undefined;
    if (tool && type === "tool_execution_start") {
      const pending = pendingPiToolCalls.get(evidence) ?? [];
      pending.push({
        tool,
        provider: "pi-json",
        args: e.args ?? e.input ?? e.arguments,
        startedAt: evidenceStartedAt(evidence),
        durationMs: 0,
      });
      pendingPiToolCalls.set(evidence, pending);
      consumed = true;
    }
    if (tool && type === "tool_execution_end") {
      const pending = pendingPiToolCalls.get(evidence) ?? [];
      const index = pending.map((call) => call.tool).lastIndexOf(tool);
      const started = index >= 0 ? pending.splice(index, 1)[0] : undefined;
      if (pending.length === 0) pendingPiToolCalls.delete(evidence);
      evidence.addToolCall({
        tool,
        provider: "pi-json",
        args: e.args ?? e.input ?? e.arguments ?? started?.args,
        result: e.result ?? e.output,
        startedAt: started?.startedAt ?? evidenceStartedAt(evidence),
        durationMs: typeof e.duration_ms === "number" ? e.duration_ms : typeof e.durationMs === "number" ? e.durationMs : 0,
      });
      consumed = true;
    }
  }

  if (type === "tool_execution_end") {
    const tool =
      typeof e.tool === "string" ? e.tool :
      typeof e.name === "string" ? e.name :
      typeof e.tool_name === "string" ? e.tool_name :
      typeof e.toolName === "string" ? e.toolName :
      "";
    const commandText =
      typeof e.command === "string" ? e.command :
      e.args && typeof e.args === "object" && !Array.isArray(e.args) && typeof (e.args as Record<string, unknown>).command === "string"
        ? (e.args as Record<string, string>).command
        : undefined;
    if (commandText && /bash|shell|command|exec/i.test(tool)) {
      evidence.addCommand({
        command: commandText,
        args: [],
        exitCode: typeof e.exit_code === "number" ? e.exit_code : typeof e.exitCode === "number" ? e.exitCode : 0,
        stdout: typeof e.stdout === "string" ? e.stdout.slice(0, 4096) : typeof e.output === "string" ? e.output.slice(0, 4096) : undefined,
        stderr: typeof e.stderr === "string" ? e.stderr.slice(0, 4096) : undefined,
        startedAt: evidenceStartedAt(evidence),
        durationMs: typeof e.duration_ms === "number" ? e.duration_ms : typeof e.durationMs === "number" ? e.durationMs : 0,
      });
    }
  }

  const usage = e.usage && typeof e.usage === "object"
    ? e.usage as Record<string, number>
    : e as Record<string, number>;
  if (type === "usage" || e.usage) {
    evidence.setUsage(normalizeUsage(usage));
    consumed = true;
  }
  return consumed || PI_KNOWN_EVENT_TYPES.has(type);
}

export const adapterRegistry: Map<string, Adapter> = new Map([
  [claudeCodeJsonAdapter.id, claudeCodeJsonAdapter],
  [codexJsonAdapter.id, codexJsonAdapter],
  [piJsonAdapter.id, piJsonAdapter],
]);
