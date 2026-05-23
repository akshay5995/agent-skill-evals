import type {
  CommandEvent,
  FileEvent,
  ToolCallEvent,
  Usage,
} from "./evidence-types.js";

export type {
  CommandEvent,
  EvidenceSnapshot,
  FileEvent,
  ToolCallEvent,
  Usage,
} from "./evidence-types.js";

/**
 * Shared type definitions for the Promptfoo-native Agent Skill Evals core.
 */

export type AssertionMode = "should" | "should_not" | "precondition";

export interface AgentSkillEvalsAssertionResult {
  pass: boolean;
  score: number;
  reason: string;
  componentResults?: AgentSkillEvalsAssertionResult[];
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

export interface EvidenceHandle {
  commands(): readonly CommandEvent[];
  filesWritten(): readonly FileEvent[];
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

export interface AgentSkillEvalsAgentProviderConfig {
  /** Adapter id, e.g. "claude-code-json", "echo-stub". */
  adapter: string;
  command?: string;
  args?: readonly string[];
  sandbox?: SandboxConfig;
  evidence?: EvidenceConfig;
}

// ---------- Verifier module ----------------------------------------------

export interface VerifierContext {
  assertion: unknown;
  world: WorldHandle;
  evidence: EvidenceHandle;
  mode: AssertionMode;
}

export interface VerifierPlugin {
  type: string;
  verify(ctx: VerifierContext): Promise<AgentSkillEvalsAssertionResult>;
}
