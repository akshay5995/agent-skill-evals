import * as Either from "effect/Either";
import * as ParseResult from "effect/ParseResult";
import * as Schema from "effect/Schema";
import {
  EVIDENCE_SCHEMA_VERSION,
  type CommandEvent,
  type EvidenceSnapshot,
  type FileEvent,
  type SkillLoadEvent,
  type RunSummary,
  type ToolCallEvent,
  type Usage,
} from "./evidence-types.js";

const OptionalString = Schema.optional(Schema.String);
const OptionalNumber = Schema.optional(Schema.Number);
const StringArray = Schema.mutable(Schema.Array(Schema.String));

const CommandEventSchema = Schema.Struct({
  command: Schema.String,
  args: Schema.optionalWith(StringArray, { default: () => [] }),
  exitCode: Schema.Number,
  signal: OptionalString,
  stdout: OptionalString,
  stderr: OptionalString,
  startedAt: Schema.Number,
  durationMs: Schema.Number,
});

const FileEventSchema = Schema.Struct({
  path: Schema.String,
  op: Schema.Literal("create", "modify", "delete"),
});

const ToolCallEventSchema = Schema.Struct({
  tool: Schema.String,
  provider: OptionalString,
  server: OptionalString,
  args: Schema.optional(Schema.Unknown),
  result: Schema.optional(Schema.Unknown),
  startedAt: Schema.Number,
  durationMs: Schema.Number,
});

const SkillLoadEventSchema = Schema.Struct({
  skill: Schema.String,
  delivery: Schema.Literal("native", "mcp"),
  provider: OptionalString,
  server: OptionalString,
  source: OptionalString,
  startedAt: Schema.Number,
});

const UsageSchema = Schema.Struct({
  inputTokens: OptionalNumber,
  outputTokens: OptionalNumber,
  totalTokens: OptionalNumber,
  cacheReadTokens: OptionalNumber,
  cacheWriteTokens: OptionalNumber,
});

const RunSummarySchema = Schema.Struct({
  runDir: Schema.String,
  worldPath: Schema.String,
  fixture: Schema.String,
  durationMs: OptionalNumber,
});

const EvidenceSnapshotSchema = Schema.Struct({
  schemaVersion: Schema.Literal(EVIDENCE_SCHEMA_VERSION),
  output: Schema.optionalWith(Schema.String, { default: () => "" }),
  run: RunSummarySchema,
  commands: Schema.optionalWith(Schema.mutable(Schema.Array(CommandEventSchema)), { default: () => [] }),
  filesWritten: Schema.optionalWith(Schema.mutable(Schema.Array(FileEventSchema)), { default: () => [] }),
  toolCalls: Schema.optionalWith(Schema.mutable(Schema.Array(ToolCallEventSchema)), { default: () => [] }),
  skillsLoaded: Schema.optionalWith(Schema.mutable(Schema.Array(SkillLoadEventSchema)), { default: () => [] }),
  usage: Schema.optionalWith(UsageSchema, { default: () => ({}) }),
  extensions: Schema.optional(Schema.Record({
    key: Schema.String,
    value: Schema.Unknown,
  })),
});

const decodeEvidenceSnapshot = Schema.decodeUnknownEither(EvidenceSnapshotSchema, {
  errors: "all",
});

export type {
  CommandEvent,
  EvidenceSnapshot,
  FileEvent,
  SkillLoadEvent,
  RunSummary,
  ToolCallEvent,
  Usage,
};

export { EVIDENCE_SCHEMA_VERSION };

export function decodeEvidenceSnapshotEither(
  input: unknown,
): Either.Either<EvidenceSnapshot, Error> {
  const decoded = decodeEvidenceSnapshot(input);
  if (Either.isRight(decoded)) return Either.right(decoded.right);
  return Either.left(new Error(ParseResult.TreeFormatter.formatErrorSync(decoded.left)));
}

export function parseEvidenceSnapshot(input: unknown): EvidenceSnapshot {
  const decoded = decodeEvidenceSnapshotEither(input);
  if (Either.isRight(decoded)) return decoded.right;
  throw decoded.left;
}
