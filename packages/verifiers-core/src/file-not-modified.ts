import type { VerifierPlugin } from "@skillkit/core";
import { applyMode } from "./_helpers.js";

interface FileNotModifiedArgs {
  path: string;
}

export const fileNotModified: VerifierPlugin = {
  type: "file.not_modified",
  async verify(ctx) {
    const a = ctx.assertion as FileNotModifiedArgs;
    const wasModified = ctx.evidence
      .filesWritten()
      .some((f) => f.path === a.path);
    const matched = !wasModified;
    return applyMode(
      matched,
      ctx.mode,
      `file.not_modified: ${a.path} unchanged`,
      `file.not_modified: ${a.path} was modified`,
    );
  },
};
