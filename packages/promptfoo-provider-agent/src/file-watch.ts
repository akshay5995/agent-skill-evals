import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import type { FileEvent } from "@skillkit/core";

/**
 * Snapshot a directory tree as { relativePath -> sha256 }. Used pre/post
 * agent run to compute file-level diffs. Skips node_modules and .git.
 */
export async function snapshotTree(root: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
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
        const buf = await readFile(p);
        const hash = createHash("sha256").update(buf).digest("hex");
        out.set(relative(root, p), hash);
      }
    }
  }
  await stat(root).catch(() => null);
  await walk(root);
  return out;
}

export function diffTrees(
  before: Map<string, string>,
  after: Map<string, string>,
): FileEvent[] {
  const events: FileEvent[] = [];
  for (const [path, hash] of after) {
    const prev = before.get(path);
    if (prev === undefined) {
      events.push({ path, op: "create" });
    } else if (prev !== hash) {
      events.push({ path, op: "modify" });
    }
  }
  for (const [path] of before) {
    if (!after.has(path)) events.push({ path, op: "delete" });
  }
  return events;
}
