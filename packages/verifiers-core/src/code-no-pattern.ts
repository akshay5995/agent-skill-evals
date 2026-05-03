import type { VerifierPlugin } from "@skillkit/core";
import { codePatternExists } from "./code-pattern-exists.js";
import { applyMode } from "./_helpers.js";

/**
 * Polarity-inverted alias of code.pattern_exists. "matched" means
 * "no pattern matches anywhere", which is the natural reading of the name.
 */
export const codeNoPattern: VerifierPlugin = {
  type: "code.no_pattern",
  async verify(ctx) {
    const inner = await codePatternExists.verify({
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
  },
};
