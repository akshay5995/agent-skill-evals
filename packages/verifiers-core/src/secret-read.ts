import type { VerifierPlugin } from "@skillkit/core";
import { applyMode } from "./_helpers.js";

const SECRET_FILE_RE = /(\.env(\.|$)|\/secrets?\/|\/credentials)/i;

/**
 * Phase 1 best-effort: reports a "secret read" when commands inspect files
 * matching common secret paths or when the evidence layer recorded an
 * explicit SecretEvent. Phase 3+ can replace with a hooked secret-access
 * proxy.
 */
export const secretRead: VerifierPlugin = {
  type: "secret.read",
  async verify(ctx) {
    const direct = ctx.evidence.secretsAccessed();
    const inferred = ctx.evidence.commands().filter((c) => {
      const argv = [c.command, ...c.args].join(" ");
      return SECRET_FILE_RE.test(argv);
    });
    const matched = direct.length > 0 || inferred.length > 0;
    return applyMode(
      matched,
      ctx.mode,
      `secret.read: ${direct.length} direct + ${inferred.length} inferred read(s)`,
      `secret.read: no secret access observed`,
    );
  },
};
