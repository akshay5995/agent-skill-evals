import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import * as Effect from "effect/Effect";
import type { FileEvent } from "../internal-types.js";
import { FileSystem, NodeServicesLive } from "../internal-services.js";

/**
 * Snapshot a directory tree as { relativePath -> sha256 }. Used pre/post
 * agent run to compute file-level diffs. Skips node_modules and .git.
 */
export async function snapshotTree(root: string): Promise<Map<string, string>> {
  return Effect.runPromise(snapshotTreeEffect(root).pipe(Effect.provide(NodeServicesLive)));
}

export function snapshotTreeEffect(
  root: string,
): Effect.Effect<Map<string, string>, never, FileSystem> {
  return Effect.gen(function* () {
  const out = new Map<string, string>();
  const fs = yield* FileSystem;
  function walk(dir: string): Effect.Effect<void, never, FileSystem> {
    return Effect.gen(function* () {
    const entries = yield* fs.readDirectory(dir).pipe(
      Effect.catchAll(() => Effect.succeed([])),
    );
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === ".git") continue;
        yield* walk(p);
      } else if (e.isFile()) {
        const buf = yield* fs.readFile(p).pipe(
          Effect.catchAll(() => Effect.succeed(null)),
        );
        if (!buf) continue;
        const hash = createHash("sha256").update(buf).digest("hex");
        out.set(relative(root, p), hash);
      }
    }
    });
  }
  yield* fs.stat(root).pipe(Effect.catchAll(() => Effect.succeed(null)));
  yield* walk(root);
  return out;
  });
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
