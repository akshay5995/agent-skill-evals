import type { VerifierPlugin } from "@skillkit/core";
import { applyMode } from "./_helpers.js";

interface VerifierSucceedsArgs {
  run: string;
  args?: readonly string[];
  timeoutMs?: number;
}

export const verifierSucceeds: VerifierPlugin = {
  type: "verifier.succeeds",
  async verify(ctx) {
    const a = ctx.assertion as VerifierSucceedsArgs;
    if (!a?.run) {
      return {
        pass: false,
        score: 0,
        reason: "verifier.succeeds: missing `run`",
      };
    }
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
