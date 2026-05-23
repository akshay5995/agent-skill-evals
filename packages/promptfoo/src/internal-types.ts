import type {
  CommandEvent,
  FileEvent,
  SkillLoadEvent,
  ToolCallEvent,
  Usage,
} from "./evidence-types.js";
import type * as Effect from "effect/Effect";

export type AssertionMode = "should" | "should_not" | "precondition";

export interface AgentSkillEvalsAssertionResult {
  pass: boolean;
  score: number;
  reason: string;
  componentResults?: AgentSkillEvalsAssertionResult[];
  evidence?: unknown;
}

export interface WorldHandle {
  readonly path: string;
  diff(): Effect.Effect<string, never>;
  listFiles(glob: string): Effect.Effect<string[], never>;
  readFile(relativePath: string): Effect.Effect<string | null, never>;
  exec(
    command: string,
    args?: readonly string[],
    opts?: { timeoutMs?: number; env?: Record<string, string> },
  ): Effect.Effect<{ exitCode: number; stdout: string; stderr: string }, never>;
}

export interface EvidenceHandle {
  commands(): readonly CommandEvent[];
  filesWritten(): readonly FileEvent[];
  toolCalls(): readonly ToolCallEvent[];
  skillsLoaded(): readonly SkillLoadEvent[];
  usage(): Usage;
}

export interface VerifierContext {
  assertion: unknown;
  world: WorldHandle;
  evidence: EvidenceHandle;
  mode: AssertionMode;
}

export interface VerifierPlugin {
  type: string;
  verify(ctx: VerifierContext): Effect.Effect<AgentSkillEvalsAssertionResult, never>;
}

export type RuntimeCheck = VerifierPlugin;

export type { CommandEvent, FileEvent, SkillLoadEvent, ToolCallEvent, Usage };
