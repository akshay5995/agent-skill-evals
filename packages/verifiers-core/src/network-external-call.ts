import type { VerifierPlugin } from "@skillkit/core";
import { applyMode } from "./_helpers.js";

const LOOPBACK_RE = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i;

export const networkExternalCall: VerifierPlugin = {
  type: "network.external_call",
  async verify(ctx) {
    const calls = ctx.evidence
      .networkCalls()
      .filter((c) => !LOOPBACK_RE.test(c.url));
    const matched = calls.length > 0;
    return applyMode(
      matched,
      ctx.mode,
      `network.external_call: ${calls.length} call(s) (${calls.slice(0, 2).map((c) => c.url).join(", ")})`,
      `network.external_call: no external traffic observed`,
    );
  },
};
