import * as Either from "effect/Either";
import * as Schema from "effect/Schema";
import type { AgentSkillEvalsAssertionResult } from "../internal-types.js";
import { validationFailure } from "./_helpers.js";

const NonEmptyString = Schema.String.pipe(
  Schema.filter((value) => value.trim().length > 0, {
    identifier: "NonEmptyString",
  }),
);

const OptionalString = Schema.optional(Schema.String);

export const PathArgsSchema = Schema.Struct({
  path: NonEmptyString,
});

export const FileContainsArgsSchema = Schema.Struct({
  path: NonEmptyString,
  text: Schema.String,
});

export const FileChangesOutsideScopeArgsSchema = Schema.Struct({
  scope: Schema.Array(NonEmptyString).pipe(Schema.minItems(1)),
});

export const CodePatternArgsSchema = Schema.Struct({
  glob: NonEmptyString,
  pattern: NonEmptyString,
});

export const VerifierArgsSchema = Schema.Struct({
  run: NonEmptyString,
  args: Schema.optional(Schema.Array(Schema.String)),
  timeoutMs: Schema.optional(Schema.Number),
});

export const ToolCalledArgsSchema = Schema.Struct({
  tool: NonEmptyString,
  provider: OptionalString,
  server: OptionalString,
  args_match: Schema.optional(Schema.Unknown),
});

export const ToolNotCalledArgsSchema = Schema.Struct({
  tool: OptionalString,
  provider: OptionalString,
  server: OptionalString,
  args_match: Schema.optional(Schema.Unknown),
});

export const SkillLoadedArgsSchema = Schema.Struct({
  should_include: Schema.optional(Schema.Array(NonEmptyString)),
  should_exclude: Schema.optional(Schema.Array(NonEmptyString)),
  delivery: Schema.optional(Schema.Literal("native", "mcp")),
  provider: OptionalString,
  server: OptionalString,
  source: OptionalString,
});

export interface CodePatternArgs {
  glob: string;
  pattern: string;
}

export interface FileChangesOutsideScopeArgs {
  scope: string[];
}

export interface FileContainsArgs {
  path: string;
  text: string;
}

export interface PathArgs {
  path: string;
}

export interface ToolCalledArgs {
  tool: string;
  provider?: string;
  server?: string;
  args_match?: unknown;
}

export interface ToolNotCalledArgs {
  tool?: string;
  provider?: string;
  server?: string;
  args_match?: unknown;
}

export interface SkillLoadedArgs {
  should_include?: string[];
  should_exclude?: string[];
  delivery?: "native" | "mcp";
  provider?: string;
  server?: string;
  source?: string;
}

export interface VerifierArgs {
  run: string;
  args?: string[];
  timeoutMs?: number;
}

export function decodeCheckArgs<A, I>(
  schema: Schema.Schema<A, I, never>,
  assertion: unknown,
  invalidReason: string,
): A | AgentSkillEvalsAssertionResult {
  const decoded = Schema.decodeUnknownEither(schema, { errors: "all" })(assertion ?? {});
  return Either.isRight(decoded) ? decoded.right : validationFailure(invalidReason);
}

export function isValidationFailure(value: unknown): value is AgentSkillEvalsAssertionResult {
  return (
    !!value &&
    typeof value === "object" &&
    "pass" in value &&
    (value as AgentSkillEvalsAssertionResult).pass === false &&
    typeof (value as AgentSkillEvalsAssertionResult).reason === "string"
  );
}

export function decodeToolNotCalledArgs(
  assertion: unknown,
): ToolNotCalledArgs | AgentSkillEvalsAssertionResult {
  const decoded = decodeCheckArgs(
    ToolNotCalledArgsSchema,
    assertion,
    "tool.not_called: assertion must include at least one selector",
  );
  return decoded;
}
