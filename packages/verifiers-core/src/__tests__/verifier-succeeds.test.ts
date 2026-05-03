import { describe, it, expect, afterEach } from "vitest";
import { verifierSucceeds } from "../verifier-succeeds.js";
import { makeWorld, makeEvidence } from "./helpers.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("verifier.succeeds", () => {
  it("passes when run exits 0 (mode=should)", async () => {
    const world = makeWorld({
      "ok.sh": "#!/bin/sh\nexit 0\n",
    });
    cleanups.push(world.cleanup);
    const r = await verifierSucceeds.verify({
      assertion: { run: "./ok.sh" },
      world,
      evidence: makeEvidence(),
      mode: "should",
    });
    expect(r.pass).toBe(true);
    expect(r.score).toBe(1);
  });

  it("fails when run exits non-zero (mode=should)", async () => {
    const world = makeWorld({
      "bad.sh": "#!/bin/sh\nexit 7\n",
    });
    cleanups.push(world.cleanup);
    const r = await verifierSucceeds.verify({
      assertion: { run: "./bad.sh" },
      world,
      evidence: makeEvidence(),
      mode: "should",
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/exited 7/);
  });

  it("inverts under mode=should_not", async () => {
    const world = makeWorld({
      "ok.sh": "#!/bin/sh\nexit 0\n",
    });
    cleanups.push(world.cleanup);
    const r = await verifierSucceeds.verify({
      assertion: { run: "./ok.sh" },
      world,
      evidence: makeEvidence(),
      mode: "should_not",
    });
    expect(r.pass).toBe(false);
  });

  it("returns missing-run reason when assertion lacks `run`", async () => {
    const world = makeWorld();
    cleanups.push(world.cleanup);
    const r = await verifierSucceeds.verify({
      assertion: {},
      world,
      evidence: makeEvidence(),
      mode: "should",
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/missing/);
  });
});
