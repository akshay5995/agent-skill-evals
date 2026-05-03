import type { VerifierPlugin } from "@skillkit/core";
import { applyMode } from "./_helpers.js";

interface FileExistsArgs {
  path: string;
}

export const fileExists: VerifierPlugin = {
  type: "file.exists",
  async verify(ctx) {
    const a = ctx.assertion as FileExistsArgs;
    const content = await ctx.world.readFile(a.path);
    const exists = content !== null;
    return applyMode(
      exists,
      ctx.mode,
      `file.exists: ${a.path} present`,
      `file.exists: ${a.path} not found`,
    );
  },
};
