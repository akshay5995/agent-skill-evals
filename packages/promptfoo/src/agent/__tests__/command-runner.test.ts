import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCommand } from "../command-runner.js";

describe("runCommand", () => {
  it("returns a timeout result instead of waiting forever", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-command-"));
    try {
      const result = await runCommand(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
        cwd: dir,
        timeoutMs: 50,
      });
      expect(result.exitCode).toBe(-1);
      expect(result.timedOut).toBe(true);
      expect(result.stderr).toContain("timed out after 50ms");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves when the direct child exits even if a grandchild inherits stdio", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-command-"));
    const script = join(dir, "leaky-child.mjs");
    writeFileSync(
      script,
      [
        "import { spawn } from 'node:child_process';",
        "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'inherit' });",
        "child.unref();",
        "console.log('parent done');",
      ].join("\n"),
    );
    try {
      const result = await runCommand(process.execPath, [script], {
        cwd: dir,
        timeoutMs: 1_000,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("parent done");
      expect(result.timedOut).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
