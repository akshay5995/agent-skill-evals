import { describe, it, expect, afterEach } from "vitest";
import { codePatternExists } from "../code-pattern-exists.js";
import { codeNoPattern } from "../code-no-pattern.js";
import { makeWorld, makeEvidence } from "./helpers.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("code.pattern_exists", () => {
  it("finds pattern in matching file", async () => {
    const world = makeWorld({
      "src/a.ts": "console.log('x')\noldLogger.log('boom')",
      "src/b.ts": "no match here",
    });
    cleanups.push(world.cleanup);
    const r = await codePatternExists.verify({
      assertion: { glob: "src/**/*.ts", pattern: "oldLogger" },
      world,
      evidence: makeEvidence(),
      mode: "should",
    });
    expect(r.pass).toBe(true);
  });

  it("fails when pattern absent", async () => {
    const world = makeWorld({ "src/a.ts": "fine" });
    cleanups.push(world.cleanup);
    const r = await codePatternExists.verify({
      assertion: { glob: "src/**/*.ts", pattern: "oldLogger" },
      world,
      evidence: makeEvidence(),
      mode: "should",
    });
    expect(r.pass).toBe(false);
  });
});

describe("code.no_pattern", () => {
  it("passes when pattern absent", async () => {
    const world = makeWorld({ "src/a.ts": "fine" });
    cleanups.push(world.cleanup);
    const r = await codeNoPattern.verify({
      assertion: { glob: "src/**/*.ts", pattern: "oldLogger" },
      world,
      evidence: makeEvidence(),
      mode: "should",
    });
    expect(r.pass).toBe(true);
  });

  it("fails when pattern present", async () => {
    const world = makeWorld({ "src/a.ts": "oldLogger.log('bad')" });
    cleanups.push(world.cleanup);
    const r = await codeNoPattern.verify({
      assertion: { glob: "src/**/*.ts", pattern: "oldLogger" },
      world,
      evidence: makeEvidence(),
      mode: "should",
    });
    expect(r.pass).toBe(false);
  });
});
