import { cp, mkdtemp, mkdir, readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve, isAbsolute } from "node:path";
import type { WorldHandle } from "@skillkit/core";

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
  const runDir = await mkdtemp(join(tmpdir(), "skillkit-run-"));
  const worldPath = join(runDir, "world");
  await mkdir(worldPath, { recursive: true });
  return { runDir, worldPath };
}

export async function copyFixture(input: CreateWorldInput, worldPath: string): Promise<void> {
  const src = isAbsolute(input.fixturePath)
    ? input.fixturePath
    : resolve(input.testFileDir ?? input.baseDir ?? process.cwd(), input.fixturePath);
  await cp(src, worldPath, { recursive: true });
}

export function makeWorldHandle(worldPath: string): WorldHandle {
  return {
    path: worldPath,
    async readFile(rel) {
      try {
        return await readFile(join(worldPath, rel), "utf8");
      } catch {
        return null;
      }
    },
    async exec(command, args = [], opts = {}) {
      return new Promise((resolveExec) => {
        const child = spawn(command, [...args], {
          cwd: worldPath,
          env: { ...process.env, ...(opts.env ?? {}) },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        const timer = opts.timeoutMs
          ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs)
          : null;
        child.on("close", (code) => {
          if (timer) clearTimeout(timer);
          resolveExec({ exitCode: code ?? -1, stdout, stderr });
        });
        child.on("error", (err) => {
          if (timer) clearTimeout(timer);
          resolveExec({ exitCode: -1, stdout, stderr: String(err) });
        });
      });
    },
    async diff() {
      // Phase 1 placeholder; Phase 2+ may wire a real diff.
      return "";
    },
  };
}
