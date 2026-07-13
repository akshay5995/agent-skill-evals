import type {
  CommandEvent,
  FileEvent,
  SkillLoadEvent,
  SkillAvailableEvent,
  RuntimeIdentity,
  ToolCallEvent,
  TurnRecord,
  Usage,
} from "./evidence-schema.js";

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
  listFiles(glob: string): Promise<string[]>;
  readFile(relativePath: string): Promise<string | null>;
  exec(
    command: string,
    args?: readonly string[],
    opts?: { timeoutMs?: number; env?: Record<string, string> },
  ): Promise<{ exitCode: number; stdout: string; stderr: string }>;
}

export interface EvidenceHandle {
  output(): string;
  commands(): readonly CommandEvent[];
  filesWritten(): readonly FileEvent[];
  toolCalls(): readonly ToolCallEvent[];
  skillsLoaded(): readonly SkillLoadEvent[];
  skillsAvailable(): readonly SkillAvailableEvent[];
  usage(): Usage;
  turns?(): readonly TurnRecord[];
  runtime?(): RuntimeIdentity;
  warnings?(): readonly string[];
}

export interface VerifierContext {
  assertion: unknown;
  world: WorldHandle;
  evidence: EvidenceHandle;
  mode: AssertionMode;
}

export interface VerifierPlugin {
  type: string;
  verify(
    ctx: VerifierContext,
  ): AgentSkillEvalsAssertionResult | Promise<AgentSkillEvalsAssertionResult>;
}

export type RuntimeCheck = VerifierPlugin;

export type { CommandEvent, FileEvent, SkillLoadEvent, SkillAvailableEvent, RuntimeIdentity, ToolCallEvent, TurnRecord, Usage };
