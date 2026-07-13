import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSkillProject } from "../../skill-checks/check.js";
import { main } from "../init.js";

function makeProject(options: { warning?: boolean; broken?: boolean } = {}) {
  const root = mkdtempSync(join(tmpdir(), "agent-skill-evals-check-"));
  mkdirSync(join(root, "skills", "demo"), { recursive: true });
  mkdirSync(join(root, "tests"), { recursive: true });
  mkdirSync(join(root, "fixtures", "demo"), { recursive: true });
  writeFileSync(
    join(root, "skills", "demo", "SKILL.md"),
    [
      "---",
      "name: demo",
      options.warning
        ? "description: Helps with things."
        : "description: Use when a demo task is requested. Do not use for unrelated work.",
      "---",
      "",
      "# Demo",
    ].join("\n"),
  );
  writeFileSync(join(root, "fixtures", "demo", "verify.sh"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  writeFileSync(
    join(root, "tests", "demo.yaml"),
    [
      "skill: ../skills/demo",
      "tests:",
      "  - prompt: Do the demo task",
      "    fixture: ../fixtures/demo",
      "    expect:",
      `      - verifier.succeeds: { run: ${options.broken ? "./missing.sh" : "./verify.sh"} }`,
    ].join("\n"),
  );
  return root;
}

describe("agent-skill-evals check", () => {
  it("keeps the distributed meta skill statically valid", async () => {
    const root = mkdtempSync(join(tmpdir(), "agent-skill-evals-meta-check-"));
    const skill = resolve(process.cwd(), "skills", "agent-eval-skills");
    writeFileSync(
      join(root, "meta.yaml"),
      [
        `skill: ${skill}`,
        "tests:",
        "  - prompt: Add an eval for this skill",
        "    expect:",
        "      - output.contains: { text: promptfoo }",
      ].join("\n"),
    );

    const result = await checkSkillProject({
      cwd: root,
      skillPath: skill,
      testPackPath: "./meta.yaml",
    });

    expect(result.ok).toBe(true);
  });

  it("checks a skill and clean Test Pack without Promptfoo", async () => {
    const root = makeProject();
    const result = await checkSkillProject({
      cwd: root,
      skillPath: "./skills/demo",
      testPackPath: "./tests/demo.yaml",
    });

    expect(result.ok).toBe(true);
    expect(result.diagnostics.filter((item) => item.level === "error")).toEqual([]);
  });

  it("returns actionable errors for missing verifier scripts", async () => {
    const root = makeProject({ broken: true });
    const result = await checkSkillProject({
      cwd: root,
      skillPath: "./skills/demo",
      testPackPath: "./tests/demo.yaml",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      level: "error",
      code: "verifier.missing",
      path: expect.stringContaining("missing.sh"),
    }));
  });

  it("rejects bare checks that omit required arguments", async () => {
    const root = makeProject();
    writeFileSync(
      join(root, "tests", "demo.yaml"),
      [
        "skill: ../skills/demo",
        "tests:",
        "  - prompt: Do the demo task",
        "    expect:",
        "      - verifier.succeeds",
      ].join("\n"),
    );

    const result = await checkSkillProject({
      cwd: root,
      skillPath: "./skills/demo",
      testPackPath: "./tests/demo.yaml",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      level: "error",
      code: "test_pack.read",
    }));
  });

  it("keeps quality warnings non-failing unless strict mode is enabled", async () => {
    const root = makeProject({ warning: true });
    const normal = await checkSkillProject({
      cwd: root,
      skillPath: "./skills/demo",
      testPackPath: "./tests/demo.yaml",
    });
    const strict = await checkSkillProject({
      cwd: root,
      skillPath: "./skills/demo",
      testPackPath: "./tests/demo.yaml",
      strict: true,
    });

    expect(normal.ok).toBe(true);
    expect(normal.diagnostics.some((item) => item.level === "warning")).toBe(true);
    expect(strict.ok).toBe(false);
  });

  it("exposes check through the public CLI with stable JSON output", async () => {
    const root = makeProject();
    const stdout: string[] = [];
    const stderr: string[] = [];
    const exitCode = await main(
      ["check", "./skills/demo", "--tests", "./tests/demo.yaml", "--json"],
      {
        cwd: root,
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text),
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr).toEqual([]);
    expect(JSON.parse(stdout.join(""))).toMatchObject({
      schemaVersion: 1,
      ok: true,
      skill: expect.stringContaining("skills/demo/SKILL.md"),
    });
    expect(existsSync(join(root, "promptfoo.skill-checks.yaml"))).toBe(false);
  });

  it("requires positive and negative load evidence in routing tests", async () => {
    const root = makeProject();
    writeFileSync(
      join(root, "tests", "demo.yaml"),
      [
        "skill: ../skills/demo",
        "builtin_distractor: true",
        "tests:",
        "  - mode: routing",
        "    prompt: Do the demo task",
        "    expect:",
        "      - output.contains: { text: done }",
      ].join("\n"),
    );
    const result = await checkSkillProject({
      cwd: root,
      skillPath: "./skills/demo",
      testPackPath: "./tests/demo.yaml",
    });

    expect(result.ok).toBe(false);
    expect(result.diagnostics.map((item) => item.code)).toEqual(expect.arrayContaining([
      "routing.skill_loaded.required",
      "routing.skill_not_loaded.required",
    ]));
  });

  it("requires negative load evidence for case-level distractors", async () => {
    const root = makeProject();
    mkdirSync(join(root, "skills", "other"), { recursive: true });
    writeFileSync(join(root, "skills", "other", "SKILL.md"), "---\nname: other\ndescription: Use when asked for other work. Do not use for demos.\n---\n");
    writeFileSync(
      join(root, "tests", "demo.yaml"),
      [
        "skill: ../skills/demo",
        "builtin_distractor: false",
        "tests:",
        "  - mode: routing",
        "    prompt: Do the demo task",
        "    distractor_skills: [../skills/other]",
        "    environment:",
        "      mocks:",
        "        - { kind: mcp, name: skills, transport: http, url: http://localhost, provides_skill_evidence: true }",
        "    expect:",
        "      - skill.loaded: { skills: [demo] }",
      ].join("\n"),
    );

    const result = await checkSkillProject({
      cwd: root,
      skillPath: "./skills/demo",
      testPackPath: "./tests/demo.yaml",
    });

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "routing.skill_not_loaded.required",
    }));
  });

  it("requires MCP mocks to declare skill-load evidence", async () => {
    const root = makeProject();
    writeFileSync(
      join(root, "tests", "demo.yaml"),
      [
        "skill: ../skills/demo",
        "tests:",
        "  - mode: routing",
        "    prompt: Do the demo task",
        "    environment:",
        "      mocks:",
        "        - { kind: mcp, name: crm, transport: http, url: http://localhost }",
        "    expect:",
        "      - skill.loaded: { skills: [demo] }",
        "      - skill.not_loaded: { skills: [agent-skill-evals-neutral] }",
      ].join("\n"),
    );

    const result = await checkSkillProject({
      cwd: root,
      skillPath: "./skills/demo",
      testPackPath: "./tests/demo.yaml",
    });

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "routing.observation.unsupported",
    }));
  });

  it("checks absolute mock file paths", async () => {
    const root = makeProject();
    const missing = join(root, "missing-server.mjs");
    writeFileSync(
      join(root, "tests", "demo.yaml"),
      [
        "skill: ../skills/demo",
        "environment:",
        "  mocks:",
        `    - { kind: http, name: api, command: ${missing}, expose_as: API_URL }`,
        "tests:",
        "  - prompt: Do the demo task",
        "    expect:",
        "      - output.contains: { text: done }",
      ].join("\n"),
    );

    const result = await checkSkillProject({
      cwd: root,
      skillPath: "./skills/demo",
      testPackPath: "./tests/demo.yaml",
    });

    expect(result.diagnostics).toContainEqual(expect.objectContaining({
      code: "mock.file.missing",
      path: missing,
    }));
  });

  it("does not mistake absolute route arguments for files", async () => {
    const root = makeProject();
    writeFileSync(
      join(root, "tests", "demo.yaml"),
      [
        "skill: ../skills/demo",
        "environment:",
        "  mocks:",
        "    - { kind: http, name: api, command: node, args: [--path, /mcp/], expose_as: API_URL }",
        "tests:",
        "  - prompt: Do the demo task",
        "    expect:",
        "      - output.contains: { text: done }",
      ].join("\n"),
    );

    const result = await checkSkillProject({
      cwd: root,
      skillPath: "./skills/demo",
      testPackPath: "./tests/demo.yaml",
    });

    expect(result.diagnostics).not.toContainEqual(expect.objectContaining({
      code: "mock.file.missing",
    }));
  });
});
