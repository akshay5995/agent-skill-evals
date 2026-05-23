import * as Effect from "effect/Effect";
import type { VerifierPlugin } from "../internal-types.js";
import { applyMode } from "./_helpers.js";
import {
  CodePatternArgsSchema,
  decodeCheckArgs,
  isValidationFailure,
} from "./schemas.js";

export const codePatternExists: VerifierPlugin = {
  type: "code.pattern_exists",
  verify(ctx) {
    return Effect.gen(function* () {
    const a = decodeCheckArgs(
      CodePatternArgsSchema,
      ctx.assertion,
      "code.pattern_exists: assertion.glob and assertion.pattern must be non-empty strings",
    );
    if (isValidationFailure(a)) return a;
    let re: RegExp;
    try {
      re = new RegExp(a.pattern);
    } catch (err) {
      return {
        pass: false,
        score: 0,
        reason: `code.pattern_exists: invalid assertion.pattern regex: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    const files = yield* ctx.world.listFiles(a.glob);
    const matchedFiles: string[] = [];
    for (const f of files) {
      const content = yield* ctx.world.readFile(f);
      if (content && re.test(content)) matchedFiles.push(f);
    }
    const matched = matchedFiles.length > 0;
    return applyMode(
      matched,
      ctx.mode,
      `code.pattern_exists: /${a.pattern}/ found in ${matchedFiles.slice(0, 3).join(", ")}`,
      `code.pattern_exists: /${a.pattern}/ not found in any ${a.glob}`,
    );
    });
  },
};
