import { describe, it, expect, afterEach } from "vitest";
import { fileExists } from "../file-exists.js";
import { fileNotModified } from "../file-not-modified.js";
import { fileContains } from "../file-contains.js";
import { makeWorld, makeEvidence } from "./helpers.js";

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length) cleanups.pop()!();
});

describe("file.exists", () => {
  it("passes when file present (should)", async () => {
    const world = makeWorld({ "src/foo.ts": "x" });
    cleanups.push(world.cleanup);
    const r = await fileExists.verify({
      assertion: { path: "src/foo.ts" },
      world,
      evidence: makeEvidence(),
      mode: "should",
    });
    expect(r.pass).toBe(true);
  });

  it("inverts under should_not", async () => {
    const world = makeWorld({ "src/foo.ts": "x" });
    cleanups.push(world.cleanup);
    const r = await fileExists.verify({
      assertion: { path: "src/foo.ts" },
      world,
      evidence: makeEvidence(),
      mode: "should_not",
    });
    expect(r.pass).toBe(false);
  });
});

describe("file.contains", () => {
  it("passes when text found", async () => {
    const world = makeWorld({ "a.txt": "hello world" });
    cleanups.push(world.cleanup);
    const r = await fileContains.verify({
      assertion: { path: "a.txt", text: "hello" },
      world,
      evidence: makeEvidence(),
      mode: "should",
    });
    expect(r.pass).toBe(true);
  });

  it("fails when file missing", async () => {
    const world = makeWorld();
    cleanups.push(world.cleanup);
    const r = await fileContains.verify({
      assertion: { path: "missing.txt", text: "x" },
      world,
      evidence: makeEvidence(),
      mode: "should",
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/not found/);
  });
});

describe("file.not_modified", () => {
  it("passes when file is not in evidence.filesWritten() (should)", async () => {
    const world = makeWorld();
    cleanups.push(world.cleanup);
    const r = await fileNotModified.verify({
      assertion: { path: "src/foo.ts" },
      world,
      evidence: makeEvidence({ filesWritten: [] }),
      mode: "should",
    });
    expect(r.pass).toBe(true);
  });

  it("fails when file appears in filesWritten()", async () => {
    const world = makeWorld();
    cleanups.push(world.cleanup);
    const r = await fileNotModified.verify({
      assertion: { path: "src/foo.ts" },
      world,
      evidence: makeEvidence({
        filesWritten: [{ path: "src/foo.ts", op: "modify" }],
      }),
      mode: "should",
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/modified/);
  });
});
