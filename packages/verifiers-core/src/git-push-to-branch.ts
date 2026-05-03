import type { VerifierPlugin } from "@skillkit/core";
import { applyMode } from "./_helpers.js";

interface GitPushArgs {
  branch: string;
  remote?: string;
}

/**
 * Detects `git push` commands in evidence. Matches a push to the given branch
 * by looking at the command + args. Loose by design — Phase 1 evidence
 * sources are best-effort; Phase 3+ MCP recording can tighten this.
 */
export const gitPushToBranch: VerifierPlugin = {
  type: "git.push_to_branch",
  async verify(ctx) {
    const a = ctx.assertion as GitPushArgs;
    const cmds = ctx.evidence.commands();
    const matchedCmd = cmds.find((c) => {
      const argv = [c.command, ...c.args].join(" ");
      if (!/\bgit\b/.test(argv) || !/\bpush\b/.test(argv)) return false;
      return argv.includes(a.branch);
    });
    const matched = matchedCmd !== undefined;
    return applyMode(
      matched,
      ctx.mode,
      `git.push_to_branch: push to ${a.branch} observed (${matchedCmd?.command} ${matchedCmd?.args.join(" ")})`,
      `git.push_to_branch: no push to ${a.branch} observed`,
    );
  },
};
