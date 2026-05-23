import * as Effect from "effect/Effect";
import type { VerifierPlugin } from "../internal-types.js";
import { applyMode } from "./_helpers.js";
import { decodeCheckArgs, isValidationFailure, PathArgsSchema } from "./schemas.js";

export const fileCreated: VerifierPlugin = {
  type: "file.created",
  verify(ctx) {
    const a = decodeCheckArgs(
      PathArgsSchema,
      ctx.assertion,
      "file.created: assertion.path must be a non-empty string",
    );
    if (isValidationFailure(a)) return Effect.succeed(a);
    const created = ctx.evidence
      .filesWritten()
      .some((ev) => ev.path === a.path && ev.op === "create");
    return Effect.succeed(applyMode(
      created,
      ctx.mode,
      `file.created: ${a.path} created`,
      `file.created: ${a.path} was not created`,
    ));
  },
};
