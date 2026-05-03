import type { VerifierPlugin } from "@skillkit/core";
import { applyMode } from "./_helpers.js";

interface FileContainsArgs {
  path: string;
  text: string;
}

export const fileContains: VerifierPlugin = {
  type: "file.contains",
  async verify(ctx) {
    const a = ctx.assertion as FileContainsArgs;
    const content = await ctx.world.readFile(a.path);
    const matched = content !== null && content.includes(a.text);
    return applyMode(
      matched,
      ctx.mode,
      `file.contains: ${a.path} contains "${a.text.slice(0, 40)}"`,
      content === null
        ? `file.contains: ${a.path} not found`
        : `file.contains: ${a.path} missing "${a.text.slice(0, 40)}"`,
    );
  },
};
