export const EVIDENCE_SCHEMA_VERSION = "agent-skill-evals.evidence.v1";

export interface CommandEvent {
  command: string;
  args: string[];
  exitCode: number;
  signal?: string;
  stdout?: string;
  stderr?: string;
  startedAt: number;
  durationMs: number;
}

export interface FileEvent {
  path: string;
  op: "create" | "modify" | "delete";
}

export interface ToolCallEvent {
  tool: string;
  provider?: string;
  server?: string;
  args?: unknown;
  result?: unknown;
  startedAt: number;
  durationMs: number;
}

export interface SkillLoadEvent {
  skill: string;
  delivery: "native" | "mcp";
  provider?: string;
  server?: string;
  source?: string;
  startedAt: number;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export interface RunSummary {
  runDir: string;
  worldPath: string;
  fixture: string;
  durationMs?: number;
}

export interface EvidenceSnapshot {
  schemaVersion: typeof EVIDENCE_SCHEMA_VERSION;
  output: string;
  run: RunSummary;
  commands: CommandEvent[];
  filesWritten: FileEvent[];
  toolCalls: ToolCallEvent[];
  skillsLoaded: SkillLoadEvent[];
  usage: Usage;
  extensions?: Record<string, unknown>;
}
