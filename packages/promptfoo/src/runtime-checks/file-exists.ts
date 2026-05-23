import * as Effect from "effect/Effect";
import type { VerifierPlugin } from "../internal-types.js";
import { applyMode } from "./_helpers.js";
import { decodeCheckArgs, isValidationFailure, PathArgsSchema } from "./schemas.js";

export const fileExists: VerifierPlugin = {
  type: "file.exists",
  verify(ctx) {
    return Effect.gen(function* () {
    const a = decodeCheckArgs(
      PathArgsSchema,
      ctx.assertion,
      "file.exists: assertion.path must be a non-empty string",
    );
    if (isValidationFailure(a)) return a;
    const content = yield* ctx.world.readFile(a.path);
    const exists = content !== null;
    return applyMode(
      exists,
      ctx.mode,
      `file.exists: ${a.path} present`,
      `file.exists: ${a.path} not found`,
    );
    });
  },
};
