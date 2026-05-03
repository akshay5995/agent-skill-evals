import type { VerifierPlugin } from "@skillkit/core";
import { applyMode } from "./_helpers.js";
import { join, relative } from "node:path";
import { readdir, stat, readFile } from "node:fs/promises";

interface CodePatternExistsArgs {
  glob: string;
  pattern: string;
}

/**
 * Minimal glob support: handles `dir/**\/*.ext` and `*.ext` style patterns.
 * Sufficient for SPEC examples; replaceable with a real glob in Phase 2+.
 */
async function listFiles(root: string, glob: string): Promise<string[]> {
  const ext = glob.match(/\.([a-zA-Z0-9]+)$/)?.[1];
  const results: string[] = [];
  async function walk(dir: string) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        await walk(p);
      } else if (e.isFile()) {
        if (!ext || p.endsWith("." + ext)) {
          results.push(relative(root, p));
        }
      }
    }
  }
  await stat(root).catch(() => null);
  await walk(root);
  return results;
}

export const codePatternExists: VerifierPlugin = {
  type: "code.pattern_exists",
  async verify(ctx) {
    const a = ctx.assertion as CodePatternExistsArgs;
    const re = new RegExp(a.pattern);
    const files = await listFiles(ctx.world.path, a.glob);
    const matchedFiles: string[] = [];
    for (const f of files) {
      const content = await ctx.world.readFile(f);
      if (content && re.test(content)) matchedFiles.push(f);
    }
    const matched = matchedFiles.length > 0;
    return applyMode(
      matched,
      ctx.mode,
      `code.pattern_exists: /${a.pattern}/ found in ${matchedFiles.slice(0, 3).join(", ")}`,
      `code.pattern_exists: /${a.pattern}/ not found in any ${a.glob}`,
    );
  },
};
