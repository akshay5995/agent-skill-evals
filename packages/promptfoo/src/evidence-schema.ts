import { z } from "zod";

export const EVIDENCE_SCHEMA_VERSION = "agent-skill-evals.evidence.v2";

const OptionalString = z.string().optional();
const OptionalNumber = z.number().optional();
const StringArray = z.array(z.string());

const CommandEventSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).default([]),
  exitCode: z.number(),
  signal: OptionalString,
  stdout: OptionalString,
  stderr: OptionalString,
  startedAt: z.number(),
  durationMs: z.number(),
  turn: OptionalNumber,
});

const FileEventSchema = z.object({
  path: z.string(),
  op: z.enum(["create", "modify", "delete"]),
});

const ToolCallEventSchema = z.object({
  tool: z.string(),
  provider: OptionalString,
  server: OptionalString,
  args: z.unknown().optional(),
  result: z.unknown().optional(),
  startedAt: z.number(),
  durationMs: z.number(),
  turn: OptionalNumber,
});

const SkillLoadEventSchema = z.object({
  skill: z.string(),
  delivery: z.enum(["native", "mcp", "explicit"]),
  provider: OptionalString,
  server: OptionalString,
  source: OptionalString,
  startedAt: z.number(),
});

const SkillAvailableEventSchema = z.object({
  skill: z.string(),
  path: z.string(),
  role: z.enum(["under-test", "supporting", "distractor"]),
});

const UsageSchema = z.object({
  inputTokens: OptionalNumber,
  outputTokens: OptionalNumber,
  totalTokens: OptionalNumber,
  cacheReadTokens: OptionalNumber,
  cacheWriteTokens: OptionalNumber,
});

const RunSummarySchema = z.object({
  runDir: z.string(),
  worldPath: z.string(),
  fixture: z.string().optional(),
  durationMs: OptionalNumber,
});

const RuntimeIdentitySchema = z.object({
  adapter: OptionalString,
  preset: OptionalString,
  command: OptionalString,
  cliVersion: OptionalString,
  model: OptionalString,
  continuation: z.enum(["transcript-replay", "native-session"]).optional(),
});

const TurnRecordSchema = z.object({
  turn: z.number(),
  role: z.enum(["user", "agent"]),
  text: z.string(),
  startedAt: z.number(),
  durationMs: z.number(),
  usage: UsageSchema.optional(),
});

const EvidenceSnapshotSchema = z.object({
  schemaVersion: z.literal(EVIDENCE_SCHEMA_VERSION),
  output: z.string().default(""),
  run: RunSummarySchema,
  commands: z.array(CommandEventSchema).default([]),
  filesWritten: z.array(FileEventSchema).default([]),
  toolCalls: z.array(ToolCallEventSchema).default([]),
  skillsLoaded: z.array(SkillLoadEventSchema).default([]),
  skillsAvailable: z.array(SkillAvailableEventSchema).default([]),
  usage: UsageSchema.default({}),
  turns: z.array(TurnRecordSchema).optional(),
  runtime: RuntimeIdentitySchema.optional(),
  warnings: StringArray.optional(),
  extensions: z.record(z.string(), z.unknown()).optional(),
});

export type CommandEvent = z.infer<typeof CommandEventSchema>;
export type FileEvent = z.infer<typeof FileEventSchema>;
export type ToolCallEvent = z.infer<typeof ToolCallEventSchema>;
export type SkillLoadEvent = z.infer<typeof SkillLoadEventSchema>;
export type SkillAvailableEvent = z.infer<typeof SkillAvailableEventSchema>;
export type Usage = z.infer<typeof UsageSchema>;
export type RunSummary = z.infer<typeof RunSummarySchema>;
export type RuntimeIdentity = z.infer<typeof RuntimeIdentitySchema>;
export type TurnRecord = z.infer<typeof TurnRecordSchema>;
export type EvidenceSnapshot = z.infer<typeof EvidenceSnapshotSchema>;

export type DecodeResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: Error };

export function decodeEvidenceSnapshot(input: unknown): DecodeResult<EvidenceSnapshot> {
  const decoded = EvidenceSnapshotSchema.safeParse(input);
  if (decoded.success) {
    return { ok: true, value: decoded.data };
  }
  return {
    ok: false,
    error: new Error(
      "the evidence file does not match the agent-skill-evals.evidence.v2 shape. " +
        "It was probably written by a different agent-skill-evals version or edited by hand — " +
        "re-run the eval to regenerate it. " +
        `Details: ${z.prettifyError(decoded.error)}`,
    ),
  };
}

export function parseEvidenceSnapshot(input: unknown): EvidenceSnapshot {
  const decoded = decodeEvidenceSnapshot(input);
  if (decoded.ok) return decoded.value;
  throw decoded.error;
}
