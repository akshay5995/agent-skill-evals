import { describe, it, expect, afterEach } from "vitest";
import { verifierFails } from "../verifier-fails.js";
import { makeWorld, makeEvidence } from "./helpers.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("verifier.fails", () => {
  it("passes when run exits non-zero (precondition use)", async () => {
    const world = makeWorld({ "bad.sh": "#!/bin/sh\nexit 1\n" });
    cleanups.push(world.cleanup);
    const r = await verifierFails.verify({
      assertion: { run: "./bad.sh" },
      world,
      evidence: makeEvidence(),
      mode: "precondition",
    });
    expect(r.pass).toBe(true);
  });

  it("fails when run unexpectedly succeeds", async () => {
    const world = makeWorld({ "ok.sh": "#!/bin/sh\nexit 0\n" });
    cleanups.push(world.cleanup);
    const r = await verifierFails.verify({
      assertion: { run: "./ok.sh" },
      world,
      evidence: makeEvidence(),
      mode: "precondition",
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/unexpectedly/);
  });
});
