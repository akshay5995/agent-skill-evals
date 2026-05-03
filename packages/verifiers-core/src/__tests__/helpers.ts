import { mkdtempSync, writeFileSync, mkdirSync, chmodSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import type {
  EvidenceHandle,
  WorldHandle,
  CommandEvent,
  FileEvent,
  NetworkEvent,
  SecretEvent,
  ToolCallEvent,
  Usage,
} from "@skillkit/core";

export function makeWorld(files: Record<string, string> = {}): WorldHandle & {
  cleanup: () => void;
} {
  const path = mkdtempSync(join(tmpdir(), "skillkit-test-"));
  for (const [rel, content] of Object.entries(files)) {
    const full = join(path, rel);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
    if (rel.endsWith(".sh")) chmodSync(full, 0o755);
  }
  return {
    path,
    async readFile(rel: string) {
      try {
        return await readFile(join(path, rel), "utf8");
      } catch {
        return null;
      }
    },
    async exec(command, args = [], opts = {}) {
      return new Promise((resolve) => {
        const child = spawn(command, args, {
          cwd: path,
          env: { ...process.env, ...(opts.env ?? {}) },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (d) => (stdout += d.toString()));
        child.stderr.on("data", (d) => (stderr += d.toString()));
        const t = opts.timeoutMs
          ? setTimeout(() => child.kill("SIGKILL"), opts.timeoutMs)
          : null;
        child.on("close", (exitCode) => {
          if (t) clearTimeout(t);
          resolve({ exitCode: exitCode ?? -1, stdout, stderr });
        });
      });
    },
    async diff() {
      return "";
    },
    cleanup() {
      rmSync(path, { recursive: true, force: true });
    },
  };
}

export function makeEvidence(input: {
  commands?: CommandEvent[];
  filesWritten?: FileEvent[];
  networkCalls?: NetworkEvent[];
  secretsAccessed?: SecretEvent[];
  toolCalls?: ToolCallEvent[];
  usage?: Usage;
} = {}): EvidenceHandle {
  return {
    commands: () => input.commands ?? [],
    filesWritten: () => input.filesWritten ?? [],
    networkCalls: () => input.networkCalls ?? [],
    secretsAccessed: () => input.secretsAccessed ?? [],
    toolCalls: () => input.toolCalls ?? [],
    usage: () => input.usage ?? {},
  };
}
