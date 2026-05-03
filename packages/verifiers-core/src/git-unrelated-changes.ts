import type { VerifierPlugin } from "@skillkit/core";
import { applyMode } from "./_helpers.js";

interface GitUnrelatedChangesArgs {
  /** Glob-like prefixes considered "related"; everything else is unrelated. */
  scope?: readonly string[];
}

export const gitUnrelatedChanges: VerifierPlugin = {
  type: "git.unrelated_changes",
  async verify(ctx) {
    const a = (ctx.assertion as GitUnrelatedChangesArgs) ?? {};
    const scope = a.scope ?? [];
    const written = ctx.evidence.filesWritten();
    const unrelated = scope.length === 0
      ? []
      : written.filter((f) => !scope.some((s) => f.path.startsWith(s)));
    const matched = unrelated.length > 0;
    return applyMode(
      matched,
      ctx.mode,
      `git.unrelated_changes: ${unrelated.length} unrelated file(s): ${unrelated.slice(0, 3).map((f) => f.path).join(", ")}`,
      `git.unrelated_changes: no unrelated changes`,
    );
  },
};
