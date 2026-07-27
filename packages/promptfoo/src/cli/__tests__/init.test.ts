import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, scaffold } from "../init.js";

describe("agent-skill-evals init scaffold", () => {
  it("creates only runtime wiring and a clean starter Test Pack", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-init-"));
    try {
      const result = scaffold({ dir, adapter: "codex", skill: "./skills/release-notes" });
      expect(result.errors).toEqual([]);
      expect(result.created.sort()).toEqual(
        [
          "agent-skill-evals/agent.mjs",
          "agent-skill-evals/assertions.js",
          "agent-skill-evals/test-generator.mjs",
          "promptfooconfig.yaml",
          "tests/release-notes.yaml",
        ].sort(),
      );
      expect(result.created).not.toContain("promptfoo.skill-checks.yaml");
      expect(result.created.some((path) => path.includes("fixtures/"))).toBe(false);

      const config = readFileSync(join(dir, "promptfooconfig.yaml"), "utf8");
      expect(config).toContain("preset: codex");
      expect(config).toContain("path: file://./agent-skill-evals/test-generator.mjs");
      expect(config).toContain("path: ./tests/release-notes.yaml");

      const testPack = readFileSync(join(dir, "tests/release-notes.yaml"), "utf8");
      expect(testPack).toContain("skill: ../skills/release-notes");
      expect(testPack).toContain("expect:");
      expect(testPack).toContain("output.contains:");
      expect(testPack).not.toContain("vars:");
      expect(testPack).not.toContain("should_not:");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("never overwrites existing files without --force", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-init-"));
    try {
      writeFileSync(join(dir, "promptfooconfig.yaml"), "keep me\n");
      const result = scaffold({ dir });
      expect(result.skipped).toContain("promptfooconfig.yaml");
      expect(readFileSync(join(dir, "promptfooconfig.yaml"), "utf8")).toBe("keep me\n");

      const forced = scaffold({ dir, force: true });
      expect(forced.created).toContain("promptfooconfig.yaml");
      expect(readFileSync(join(dir, "promptfooconfig.yaml"), "utf8")).not.toBe("keep me\n");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects unknown adapters", () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-init-"));
    try {
      const result = scaffold({ dir, adapter: "cursor" });
      expect(result.created).toEqual([]);
      expect(result.errors[0]).toMatch(/unknown adapter "cursor"/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prints usage and exits 0 for help flags", async () => {
    for (const flag of ["help", "--help", "-h"]) {
      const stdout: string[] = [];
      const exitCode = await main([flag], {
        cwd: tmpdir(),
        stdout: (text) => stdout.push(text),
        stderr: () => undefined,
      });
      expect(exitCode).toBe(0);
      expect(stdout.join("")).toContain("Usage:");
    }
  });

  it("prints the package version for --version", async () => {
    const stdout: string[] = [];
    const exitCode = await main(["--version"], {
      cwd: tmpdir(),
      stdout: (text) => stdout.push(text),
      stderr: () => undefined,
    });
    expect(exitCode).toBe(0);
    expect(stdout.join("")).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it("notes when the target skill does not exist yet", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-init-"));
    const stdout: string[] = [];
    try {
      const exitCode = await main(
        ["init", "--skill", "./skills/release-notes", "--adapter", "codex"],
        { cwd: dir, stdout: (text) => stdout.push(text), stderr: () => undefined },
      );
      expect(exitCode).toBe(0);
      expect(stdout.join("")).toContain("./skills/release-notes does not exist yet");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("does not warn when the target skill already exists", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-init-"));
    const stdout: string[] = [];
    try {
      mkdirSync(join(dir, "skills", "release-notes"), { recursive: true });
      writeFileSync(join(dir, "skills", "release-notes", "SKILL.md"), "---\nname: release-notes\ndescription: Use when drafting release notes.\n---\n");
      const exitCode = await main(
        ["init", "--skill", "./skills/release-notes", "--adapter", "codex"],
        { cwd: dir, stdout: (text) => stdout.push(text), stderr: () => undefined },
      );
      expect(exitCode).toBe(0);
      expect(stdout.join("")).not.toContain("does not exist yet");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("prints runnable next steps without implying the TODO test is ready", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-init-"));
    const stdout: string[] = [];
    try {
      const exitCode = await main(
        ["init", "--skill", "./skills/release-notes", "--adapter", "codex"],
        { cwd: dir, stdout: (text) => stdout.push(text), stderr: () => undefined },
      );
      expect(exitCode).toBe(0);
      expect(stdout.join("")).toContain("pnpm exec agent-skill-evals check ./skills/release-notes");
      expect(stdout.join("")).toContain("Replace the TODO expectation");
      expect(stdout.join("")).toContain("pnpm exec promptfoo eval");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
