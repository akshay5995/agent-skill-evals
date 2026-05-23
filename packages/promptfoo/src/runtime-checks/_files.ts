import { join, relative } from "node:path";
import * as Effect from "effect/Effect";
import { FileSystem, NodeServicesLive } from "../internal-services.js";

const SKIP_DIRS = new Set(["node_modules", ".git"]);

export async function walkFiles(
  root: string,
  visit: (relativePath: string, absolutePath: string) => Promise<void> | void,
): Promise<void> {
  return Effect.runPromise(
    walkFilesEffect(root, (relativePath, absolutePath) =>
      Effect.promise(() => Promise.resolve(visit(relativePath, absolutePath))),
    ).pipe(Effect.provide(NodeServicesLive)),
  );
}

export function walkFilesEffect(
  root: string,
  visit: (relativePath: string, absolutePath: string) => Effect.Effect<void, never, FileSystem>,
): Effect.Effect<void, never, FileSystem> {
  return Effect.gen(function* () {
  const fs = yield* FileSystem;
  function walk(dir: string): Effect.Effect<void, never, FileSystem> {
    return Effect.gen(function* () {
    const entries = yield* fs.readDirectory(dir).pipe(
      Effect.catchAll(() => Effect.succeed([])),
    );
    for (const entry of entries) {
      const absolutePath = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        yield* walk(absolutePath);
        continue;
      }
      if (entry.isFile()) {
        yield* visit(relative(root, absolutePath), absolutePath);
      }
    }
    });
  }

  const rootStat = yield* fs.stat(root).pipe(Effect.catchAll(() => Effect.succeed(null)));
  if (!rootStat?.isDirectory()) return;
  yield* walk(root);
  });
}

/**
 * Minimal glob support for Agent Skill Evals verifier conventions. Handles literal
 * paths, recursive extension globs, and `*` segments without adding a runtime
 * dependency.
 */
export async function listMatchingFiles(root: string, glob: string): Promise<string[]> {
  return Effect.runPromise(listMatchingFilesEffect(root, glob).pipe(Effect.provide(NodeServicesLive)));
}

export function listMatchingFilesEffect(
  root: string,
  glob: string,
): Effect.Effect<string[], never, FileSystem> {
  return Effect.gen(function* () {
  const matches: string[] = [];
  yield* walkFilesEffect(root, (relativePath) => Effect.sync(() => {
    if (matchesGlob(relativePath, glob)) matches.push(relativePath);
  }));
  return matches;
  });
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
