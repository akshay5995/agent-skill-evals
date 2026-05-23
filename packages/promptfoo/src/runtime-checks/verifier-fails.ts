import * as Effect from "effect/Effect";
import type { VerifierPlugin } from "../internal-types.js";
import { applyMode } from "./_helpers.js";
import { decodeCheckArgs, isValidationFailure, VerifierArgsSchema } from "./schemas.js";

export const verifierFails: VerifierPlugin = {
  type: "verifier.fails",
  verify(ctx) {
    return Effect.gen(function* () {
    const a = decodeCheckArgs(
      VerifierArgsSchema,
      ctx.assertion,
      "verifier.fails: assertion.run must be a non-empty string",
    );
    if (isValidationFailure(a)) return a;
    const r = yield* ctx.world.exec(a.run, a.args ?? [], {
      timeoutMs: a.timeoutMs ?? 60_000,
    });
    const matched = r.exitCode !== 0;
    return applyMode(
      matched,
      ctx.mode,
      `verifier.fails: ${a.run} exited ${r.exitCode} (failed as expected)`,
      `verifier.fails: ${a.run} unexpectedly exited 0`,
    );
    });
  },
};
