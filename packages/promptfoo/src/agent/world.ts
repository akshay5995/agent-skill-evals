import { join, resolve, isAbsolute } from "node:path";
import { cp, mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { CommandEvent, WorldHandle } from "../internal-types.js";
import { runCommand } from "./command-runner.js";
import { listMatchingFiles } from "../runtime-checks/_files.js";

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
  const runDir = await mkdtemp(join(tmpdir(), "agent-skill-evals-run-"));
  const worldPath = join(runDir, "world");
  await mkdir(worldPath, { recursive: true });
  return { runDir, worldPath };
}

export async function copyFixture(
  input: CreateWorldInput,
  worldPath: string,
): Promise<void> {
  const src = isAbsolute(input.fixturePath)
    ? input.fixturePath
    : resolve(input.testFileDir ?? input.baseDir ?? process.cwd(), input.fixturePath);
  await cp(src, worldPath, { recursive: true });
}

export function makeWorldHandle(
  worldPath: string,
  recordCommand?: (event: CommandEvent) => void,
): WorldHandle {
  return {
    path: worldPath,
    async readFile(rel) {
      try {
        return await readFile(join(worldPath, rel), "utf8");
      } catch {
        return null;
      }
    },
    listFiles(glob) {
      return listMatchingFiles(worldPath, glob);
    },
    async exec(command, args = [], opts = {}) {
      const result = await runCommand(command, args, {
        cwd: worldPath,
        env: { ...process.env, ...(opts.env ?? {}) },
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
    },
  };
}
