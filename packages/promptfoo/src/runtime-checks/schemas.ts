import { z } from "zod";
import type {
  AgentSkillEvalsAssertionResult,
  AssertionMode,
} from "../internal-types.js";

export function result(
  pass: boolean,
  reason: string,
  evidence?: unknown,
): AgentSkillEvalsAssertionResult {
  return { pass, score: pass ? 1 : 0, reason, evidence };
}

export function validationFailure(reason: string): AgentSkillEvalsAssertionResult {
  return result(false, reason);
}

/**
 * Map a "matched" boolean to a pass result based on mode. Used by checks
 * that don't self-encode polarity (file.exists, tool.called, ...).
 *
 * - should: pass = matched
 * - should_not: pass = !matched
 * - precondition: pass = matched (precondition asserts a current state)
 */
export function applyMode(
  matched: boolean,
  mode: AssertionMode,
  reasonMatched: string,
  reasonUnmatched: string,
): AgentSkillEvalsAssertionResult {
  switch (mode) {
    case "should":
    case "precondition":
      return result(matched, matched ? reasonMatched : reasonUnmatched);
    case "should_not":
      return result(!matched, matched ? reasonMatched : reasonUnmatched);
  }
}

const NonEmptyString = z.string().trim().min(1);
const OptionalString = z.string().optional();
const OptionalNonEmptyString = NonEmptyString.optional();

export const PathArgsSchema = z.object({
  path: NonEmptyString,
});

export const FileContainsArgsSchema = z.object({
  path: NonEmptyString,
  text: z.string(),
});

export const FileChangesWithinArgsSchema = z.object({
  paths: z.array(NonEmptyString).min(1),
});

export const VerifierArgsSchema = z.object({
  run: NonEmptyString,
  args: z.array(z.string()).optional(),
  timeoutMs: z.number().optional(),
});

export const ToolCalledArgsSchema = z.object({
  tool: NonEmptyString,
  provider: OptionalString,
  server: OptionalString,
  args_match: z.unknown().optional(),
});

const JsonValueSchema = z.union([
  z.null(),
  z.boolean(),
  z.number(),
  z.string(),
  z.array(z.unknown()),
  z.record(z.string(), z.unknown()),
]);

const ToolNotCalledSelectorSchema = z.object({
  tool: OptionalNonEmptyString,
  provider: OptionalNonEmptyString,
  server: OptionalNonEmptyString,
  args_match: JsonValueSchema.optional(),
});

export const ToolNotCalledArgsSchema = z.intersection(
  ToolNotCalledSelectorSchema,
  z.union([
    z.object({ tool: NonEmptyString }),
    z.object({ provider: NonEmptyString }),
    z.object({ server: NonEmptyString }),
    z.object({ args_match: JsonValueSchema }),
  ]),
);

export const SkillSelectionArgsSchema = z.object({
  skills: z.array(NonEmptyString).min(1),
  delivery: z.enum(["native", "mcp"]).optional(),
  provider: OptionalString,
  server: OptionalString,
  source: OptionalString,
});

export const ToolCountArgsSchema = z.object({
  tool: OptionalString,
  provider: OptionalString,
  server: OptionalString,
  args_match: z.unknown().optional(),
  turn: z.number().optional(),
  before_turn: z.number().optional(),
  after_turn: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const TurnCountArgsSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
});

export const ToolSequenceArgsSchema = z.object({
  order: z.array(NonEmptyString).min(2),
});

export const OutputContainsArgsSchema = z.object({
  text: z.string(),
});

export const OutputMatchesArgsSchema = z.object({
  pattern: NonEmptyString,
  flags: z.string().optional(),
});

export type ToolNotCalledArgs = z.infer<typeof ToolNotCalledArgsSchema>;

/**
 * Decode assertion args with a zod schema. Returns the parsed value, or a
 * failed assertion result carrying `invalidReason` when parsing fails.
 */
export function decodeCheckArgs<T>(
  schema: z.ZodType<T>,
  assertion: unknown,
  invalidReason: string,
): T | AgentSkillEvalsAssertionResult {
  const decoded = schema.safeParse(assertion ?? {});
  return decoded.success ? decoded.data : validationFailure(invalidReason);
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
  return decodeCheckArgs(
    ToolNotCalledArgsSchema,
    assertion,
    "tool.not_called: assertion must include at least one selector",
  );
}
