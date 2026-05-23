import { join, resolve, isAbsolute } from "node:path";
import * as Effect from "effect/Effect";
import type { CommandEvent, WorldHandle } from "../internal-types.js";
import { Environment, FileSystem, NodeServicesLive } from "../internal-services.js";
import { runCommandEffect, ProcessRunnerLive } from "./command-runner.js";
import { listMatchingFilesEffect } from "../runtime-checks/_files.js";

export interface CreateWorldInput {
  fixturePath: string;
  testFileDir?: string;
  baseDir?: string;
}

export interface RunDir {
  runDir: string;
  worldPath: string;
}

export async function createRunDir(): Promise<RunDir> {
  return Effect.runPromise(createRunDirEffect().pipe(Effect.provide(NodeServicesLive)));
}

export function createRunDirEffect(): Effect.Effect<RunDir, unknown, FileSystem> {
  return Effect.gen(function* () {
  const fs = yield* FileSystem;
  const runDir = yield* fs.makeTempDirectory("agent-skill-evals-run-");
  const worldPath = join(runDir, "world");
  yield* fs.makeDirectory(worldPath);
  return { runDir, worldPath };
  });
}

export async function copyFixture(input: CreateWorldInput, worldPath: string): Promise<void> {
  return Effect.runPromise(copyFixtureEffect(input, worldPath).pipe(Effect.provide(NodeServicesLive)));
}

export function copyFixtureEffect(
  input: CreateWorldInput,
  worldPath: string,
): Effect.Effect<void, unknown, FileSystem | Environment> {
  return Effect.gen(function* () {
  const fs = yield* FileSystem;
  const env = yield* Environment;
  const cwd = yield* env.cwd;
  const src = isAbsolute(input.fixturePath)
    ? input.fixturePath
    : resolve(input.testFileDir ?? input.baseDir ?? cwd, input.fixturePath);
  yield* fs.copyDirectory(src, worldPath);
  });
}

export function makeWorldHandle(
  worldPath: string,
  recordCommand?: (event: CommandEvent) => void,
): WorldHandle {
  return {
    path: worldPath,
    readFile(rel) {
      return Effect.gen(function* () {
        const fs = yield* FileSystem;
        return yield* fs.readText(join(worldPath, rel)).pipe(
          Effect.catchAll(() => Effect.succeed(null)),
        );
      }).pipe(Effect.provide(NodeServicesLive));
    },
    listFiles(glob) {
      return listMatchingFilesEffect(worldPath, glob).pipe(
        Effect.provide(NodeServicesLive),
      );
    },
    exec(command, args = [], opts = {}) {
      return Effect.gen(function* () {
        const environment = yield* Environment;
        const env = yield* environment.env;
        const result = yield* runCommandEffect(command, args, {
          cwd: worldPath,
          env: { ...env, ...(opts.env ?? {}) },
          timeoutMs: opts.timeoutMs,
        });
        recordCommand?.({
          command,
          args: [...args],
          exitCode: result.exitCode,
          stdout: result.stdout.slice(0, 4096),
          stderr: result.stderr.slice(0, 4096),
          startedAt: result.startedAt,
          durationMs: result.durationMs,
        });
        return {
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        };
      }).pipe(
        Effect.provide(ProcessRunnerLive),
        Effect.provide(NodeServicesLive),
      );
    },
    diff() {
      // Phase 1 placeholder; Phase 2+ may wire a real diff.
      return Effect.succeed("");
    },
  };
}
