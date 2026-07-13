import { join, relative } from "node:path";
import { readdir, stat } from "node:fs/promises";

const SKIP_DIRS = new Set(["node_modules", ".git"]);

export async function walkFiles(
  root: string,
  visit: (relativePath: string, absolutePath: string) => void | Promise<void>,
): Promise<void> {
  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const absolutePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        await visit(relative(root, absolutePath), absolutePath);
      }
    }
  }

  try {
    const rootStat = await stat(root);
    if (!rootStat.isDirectory()) return;
  } catch {
    return;
  }
  await walk(root);
}

/**
 * Minimal glob support for Agent Skill Evals verifier conventions. Handles literal
 * paths, recursive extension globs, and `*` segments without adding a runtime
 * dependency.
 */
export async function listMatchingFiles(root: string, glob: string): Promise<string[]> {
  const matches: string[] = [];
  await walkFiles(root, (relativePath) => {
    if (matchesGlob(relativePath, glob)) matches.push(relativePath);
  });
  return matches;
}

export function matchesGlob(relativePath: string, glob: string): boolean {
  if (!glob.includes("/") && relativePath.includes("/")) {
    return globToRegExp(glob).test(relativePath.split("/").at(-1) ?? relativePath);
  }
  return globToRegExp(glob).test(relativePath);
}

function globToRegExp(glob: string): RegExp {
  const globstar = "__AGENT_SKILL_EVALS_GLOBSTAR__";
  const star = "__AGENT_SKILL_EVALS_STAR__";
  const pattern = glob
    .replace(/^\.\//, "")
    .replace(/\*\*\//g, globstar)
    .replace(/\*\*/g, globstar)
    .replace(/\*/g, star)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll(globstar, "(?:.*/)?")
    .replaceAll(star, "[^/]*");
  return new RegExp(`^${pattern}$`);
}
