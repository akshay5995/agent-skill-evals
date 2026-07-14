import type { VerifierPlugin } from "../internal-types.js";
import {
  applyMode,
  decodeCheckArgs,
  isValidationFailure,
  VerifierArgsSchema,
} from "./schemas.js";

export const verifierSucceeds: VerifierPlugin = {
  type: "verifier.succeeds",
  async verify(ctx) {
    const a = decodeCheckArgs(
      VerifierArgsSchema,
      ctx.assertion,
      "verifier.succeeds: assertion.run must be a non-empty string",
    );
    if (isValidationFailure(a)) return a;
    const r = await ctx.world.exec(a.run, a.args ?? [], {
      timeoutMs: a.timeoutMs ?? 60_000,
    });
    const matched = r.exitCode === 0;
    return applyMode(
      matched,
      ctx.mode,
      `verifier.succeeds: ${a.run} exited 0`,
      `verifier.succeeds: ${a.run} exited ${r.exitCode}: ${r.stderr.slice(0, 200)}`,
    );
  },
};

export const verifierFails: VerifierPlugin = {
  type: "verifier.fails",
  async verify(ctx) {
    const a = decodeCheckArgs(
      VerifierArgsSchema,
      ctx.assertion,
      "verifier.fails: assertion.run must be a non-empty string",
    );
    if (isValidationFailure(a)) return a;
    const r = await ctx.world.exec(a.run, a.args ?? [], {
      timeoutMs: a.timeoutMs ?? 60_000,
    });
    const matched = r.exitCode !== 0;
    return applyMode(
      matched,
      ctx.mode,
      `verifier.fails: ${a.run} exited ${r.exitCode} (failed as expected)`,
      `verifier.fails: ${a.run} unexpectedly exited 0`,
    );
  },
};
