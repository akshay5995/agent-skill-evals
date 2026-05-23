import * as Effect from "effect/Effect";
import type { VerifierPlugin } from "../internal-types.js";
import { codePatternExists } from "./code-pattern-exists.js";
import { applyMode } from "./_helpers.js";
import {
  CodePatternArgsSchema,
  decodeCheckArgs,
  isValidationFailure,
} from "./schemas.js";

/**
 * Polarity-inverted alias of code.pattern_exists. "matched" means
 * "no pattern matches anywhere", which is the natural reading of the name.
 */
export const codeNoPattern: VerifierPlugin = {
  type: "code.no_pattern",
  verify(ctx) {
    return Effect.gen(function* () {
    const a = decodeCheckArgs(
      CodePatternArgsSchema,
      ctx.assertion,
      "code.no_pattern: assertion.glob and assertion.pattern must be non-empty strings",
    );
    if (isValidationFailure(a)) return a;
    try {
      new RegExp(a.pattern);
    } catch (err) {
      return {
        pass: false,
        score: 0,
        reason: `code.no_pattern: invalid assertion.pattern regex: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const inner = yield* codePatternExists.verify({
      ...ctx,
      mode: "should",
    });
    // inner.pass = pattern was found
    const matched = !inner.pass;
    return applyMode(
      matched,
      ctx.mode,
      `code.no_pattern: pattern absent`,
      `code.no_pattern: pattern present (${inner.reason})`,
    );
    });
  },
};
