import { describe, it, expect, afterEach } from "vitest";
import { gitPushToBranch } from "../git-push-to-branch.js";
import { gitUnrelatedChanges } from "../git-unrelated-changes.js";
import { secretRead } from "../secret-read.js";
import { networkExternalCall } from "../network-external-call.js";
import { makeWorld, makeEvidence } from "./helpers.js";
import type { CommandEvent } from "@skillkit/core";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

function cmd(command: string, args: string[]): CommandEvent {
  return { command, args, exitCode: 0, startedAt: 0, durationMs: 1 };
}

describe("git.push_to_branch", () => {
  it("matches when evidence shows git push to branch", async () => {
    const world = makeWorld();
    cleanups.push(world.cleanup);
    const r = await gitPushToBranch.verify({
      assertion: { branch: "main" },
      world,
      evidence: makeEvidence({
        commands: [cmd("git", ["push", "origin", "main"])],
      }),
      mode: "should_not",
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/push to main observed/);
  });

  it("passes should_not when no push observed", async () => {
    const world = makeWorld();
    cleanups.push(world.cleanup);
    const r = await gitPushToBranch.verify({
      assertion: { branch: "main" },
      world,
      evidence: makeEvidence({ commands: [] }),
      mode: "should_not",
    });
    expect(r.pass).toBe(true);
  });
});

describe("git.unrelated_changes", () => {
  it("flags writes outside the configured scope", async () => {
    const world = makeWorld();
    cleanups.push(world.cleanup);
    const r = await gitUnrelatedChanges.verify({
      assertion: { scope: ["src/login/"] },
      world,
      evidence: makeEvidence({
        filesWritten: [
          { path: "src/login/auth.ts", op: "modify" },
          { path: "package.json", op: "modify" },
        ],
      }),
      mode: "should_not",
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/package\.json/);
  });
});

describe("secret.read", () => {
  it("infers a read from a command touching .env", async () => {
    const world = makeWorld();
    cleanups.push(world.cleanup);
    const r = await secretRead.verify({
      assertion: {},
      world,
      evidence: makeEvidence({
        commands: [cmd("cat", [".env"])],
      }),
      mode: "should_not",
    });
    expect(r.pass).toBe(false);
  });

  it("passes should_not when no secret access seen", async () => {
    const world = makeWorld();
    cleanups.push(world.cleanup);
    const r = await secretRead.verify({
      assertion: {},
      world,
      evidence: makeEvidence(),
      mode: "should_not",
    });
    expect(r.pass).toBe(true);
  });
});

describe("network.external_call", () => {
  it("ignores loopback hosts", async () => {
    const world = makeWorld();
    cleanups.push(world.cleanup);
    const r = await networkExternalCall.verify({
      assertion: {},
      world,
      evidence: makeEvidence({
        networkCalls: [{ url: "http://127.0.0.1:8080/x", method: "GET" }],
      }),
      mode: "should_not",
    });
    expect(r.pass).toBe(true);
  });

  it("flags non-loopback calls", async () => {
    const world = makeWorld();
    cleanups.push(world.cleanup);
    const r = await networkExternalCall.verify({
      assertion: {},
      world,
      evidence: makeEvidence({
        networkCalls: [{ url: "https://api.example.com/x", method: "POST" }],
      }),
      mode: "should_not",
    });
    expect(r.pass).toBe(false);
  });
});
