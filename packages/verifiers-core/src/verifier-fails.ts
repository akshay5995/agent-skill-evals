import type { VerifierPlugin } from "@skillkit/core";
import { applyMode } from "./_helpers.js";

interface VerifierFailsArgs {
  run: string;
  args?: readonly string[];
  timeoutMs?: number;
}

export const verifierFails: VerifierPlugin = {
  type: "verifier.fails",
  async verify(ctx) {
    const a = ctx.assertion as VerifierFailsArgs;
    if (!a?.run) {
      return {
        pass: false,
        score: 0,
        reason: "verifier.fails: missing `run`",
      };
    }
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
