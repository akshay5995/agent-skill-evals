/**
 * @skillkit/core — shared type definitions used across the SkillKit packages.
 *
 * Phase 0 ships the type surface the SPEC §11 calls out. Concrete shapes for
 * the {@link EvidenceHandle} event types and {@link WorldHandle} are defined
 * here so downstream packages can import them without duplicating contracts.
 *
 * Anything MCP-shaped (McpServerSpec, McpConfig, McpCallEvent) lives in
 * @skillkit/mcp-core to keep MCP optional. Anything generator-shaped lives in
 * @skillkit/generator-default.
 */

export type AssertionMode = "should" | "should_not" | "precondition";

export interface SkillKitAssertionResult {
  pass: boolean;
  score: number;
  reason: string;
  componentResults?: SkillKitAssertionResult[];
  evidence?: unknown;
}

// ---------- World ---------------------------------------------------------

export interface WorldHandle {
  /** Absolute path to the per-run isolated world (a fixture copy). */
  readonly path: string;
  /** Unified diff of the world relative to the original fixture, lazily computed. */
  diff(): Promise<string>;
  /** Read a file from the world. Returns null if missing. */
  readFile(relativePath: string): Promise<string | null>;
  /** Spawn a command inside the world; returns the exit code, stdout, stderr. */
  exec(
    command: string,
    args?: readonly string[],
    opts?: { timeoutMs?: number; env?: Record<string, string> },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

// ---------- Evidence ------------------------------------------------------

export interface CommandEvent {
  command: string;
  args: readonly string[];
  exitCode: number;
  stdout?: string;
  stderr?: string;
  startedAt: number;
  durationMs: number;
}

export interface FileEvent {
  path: string;
  op: "create" | "modify" | "delete" | "rename";
  bytesAfter?: number;
}

export interface NetworkEvent {
  url: string;
  method: string;
  status?: number;
  blocked?: boolean;
}

export interface SecretEvent {
  name: string;
  source: "env" | "file" | "keychain" | "other";
}

export interface ToolCallEvent {
  /** Free-form tool identifier — agents may emit "Bash", "Edit", custom names. */
  tool: string;
  args?: unknown;
  result?: unknown;
  startedAt: number;
  durationMs: number;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface EvidenceHandle {
  commands(): readonly CommandEvent[];
  filesWritten(): readonly FileEvent[];
  networkCalls(): readonly NetworkEvent[];
  secretsAccessed(): readonly SecretEvent[];
  toolCalls(): readonly ToolCallEvent[];
  usage(): Usage;
}

// ---------- Provider config ----------------------------------------------

export interface SandboxConfig {
  /** Copy the fixture into a temp dir per case (default true). */
  freshWorldPerCase?: boolean;
  /** Network policy. Phase 1 honours "deny-by-default" only via documentation. */
  network?: "allow" | "deny-by-default" | "deny-all";
  /** Optional list of allowed hosts when `network: deny-by-default`. */
  allowedHosts?: readonly string[];
}

export interface EvidenceConfig {
  /** Which adapters should populate the EvidenceHandle. */
  sources?: readonly string[];
}

export interface SkillKitAgentProviderConfig {
  /** Adapter id, e.g. "claude-code-json", "echo-stub". */
  adapter: string;
  command?: string;
  args?: readonly string[];
  sandbox?: SandboxConfig;
  evidence?: EvidenceConfig;
  /** MCP config is owned by @skillkit/mcp-core; left as opaque here. */
  mcp?: unknown;
}

// ---------- Verifier plugin ----------------------------------------------

export interface VerifierContext {
  assertion: unknown;
  world: WorldHandle;
  evidence: EvidenceHandle;
  mode: AssertionMode;
}

export interface VerifierPlugin {
  type: string;
  verify(ctx: VerifierContext): Promise<SkillKitAssertionResult>;
}
