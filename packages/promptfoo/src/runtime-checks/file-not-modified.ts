import * as Effect from "effect/Effect";
import type { VerifierPlugin } from "../internal-types.js";
import { applyMode } from "./_helpers.js";
import { decodeCheckArgs, isValidationFailure, PathArgsSchema } from "./schemas.js";

export const fileNotModified: VerifierPlugin = {
  type: "file.not_modified",
  verify(ctx) {
    const a = decodeCheckArgs(
      PathArgsSchema,
      ctx.assertion,
      "file.not_modified: assertion.path must be a non-empty string",
    );
    if (isValidationFailure(a)) return Effect.succeed(a);
    const wasModified = ctx.evidence
      .filesWritten()
      .some((f) => f.path === a.path);
    const matched = !wasModified;
    return Effect.succeed(applyMode(
      matched,
      ctx.mode,
      `file.not_modified: ${a.path} unchanged`,
      `file.not_modified: ${a.path} was modified`,
    ));
  },
};
