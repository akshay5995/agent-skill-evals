import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { agentSkillEvalsStaticAssertions } from "../assertions-static/index.js";
import { AgentSkillEvalsStaticProvider } from "../index.js";

let dir: string;
const integrationFixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../integration/fixtures",
);

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "agent-skill-evals-static-provider-"));
  mkdirSync(join(dir, "skills", "bugfix"), { recursive: true });
  mkdirSync(join(dir, "tests"), { recursive: true });
  mkdirSync(join(dir, "fixtures", "bug"), { recursive: true });
  writeFileSync(
    join(dir, "skills", "bugfix", "SKILL.md"),
    [
      "---",
      "name: bugfix",
      "description: Use when fixing bugs. Do not use for feature work.",
      "---",
      "# bugfix",
    ].join("\n"),
  );
  writeFileSync(join(dir, "fixtures", "bug", "verify.sh"), "#!/bin/sh\nexit 0\n");
  chmodSync(join(dir, "fixtures", "bug", "verify.sh"), 0o755);
  writeFileSync(
    join(dir, "tests", "bugfix.yaml"),
    [
      "- description: fixes bug",
      "  vars:",
      "    prompt: Fix the bug",
      "    fixture: ./fixtures/bug",
      "    should:",
      "      - verifier.succeeds:",
      "          run: ./verify.sh",
    ].join("\n"),
  );
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function provider() {
  return new AgentSkillEvalsStaticProvider({ config: { baseDir: dir } });
}

describe("AgentSkillEvalsStaticProvider", () => {
  it("loads skill and tests with readable output", async () => {
    const r = await provider().callApi("static-check", {
      vars: {
        skillPath: "./skills/bugfix",
        testsGlob: "./tests/bugfix.yaml",
      },
    });
    expect(r.error).toBeUndefined();
    expect(r.output).toMatch(/Agent Skill Evals skill check input loaded/);
    expect(r.output).toMatch(/skill: bugfix/);
    expect(r.output).toMatch(/tests: 1 case\(s\) from 1 file\(s\)/);
    expect(r.output).toMatch(/warnings: none/);
  });

  it("fails clearly without skillPath", async () => {
    const r = await provider().callApi("static-check", {
      vars: { testsGlob: "./tests/bugfix.yaml" },
    });
    expect(r.error).toMatch(/vars\.skillPath is required/);
  });

  it("fails clearly without testsGlob", async () => {
    const r = await provider().callApi("static-check", {
      vars: { skillPath: "./skills/bugfix" },
    });
    expect(r.error).toMatch(/vars\.testsGlob is required/);
  });

  it("reports malformed Runtime Test Fields metadata", async () => {
    writeFileSync(
      join(dir, "tests", "double-negative.yaml"),
      [
        "- description: double negative",
        "  vars:",
        "    prompt: Fix the bug",
        "    fixture: ./fixtures/bug",
        "    should_not:",
        "      - code.no_pattern:",
        "          glob: '**/*.js'",
        "          pattern: TODO",
      ].join("\n"),
    );
    const r = await provider().callApi("static-check", {
      vars: {
        skillPath: "./skills/bugfix",
        testsGlob: "./tests/double-negative.yaml",
      },
    });
    expect(r.metadata?.tests).toMatchObject({
      tests: [
        {
          entryErrors: [
            expect.objectContaining({
              reason: expect.stringMatching(/must be declared under should/),
            }),
          ],
        },
      ],
    });
  });

  it("keeps static parser failures in metadata instead of rejecting the provider call", async () => {
    writeFileSync(
      join(dir, "tests", "broken.yaml"),
      [
        "- description: broken",
        "  vars:",
        "    prompt: [unterminated",
      ].join("\n"),
    );

    const r = await provider().callApi("static-check", {
      vars: {
        skillPath: "./skills/bugfix",
        testsGlob: "./tests/broken.yaml",
      },
    });

    expect(r.error).toBeUndefined();
    expect(r.output).toMatch(/Agent Skill Evals skill check input loaded/);
    expect(r.metadata?.tests).toMatchObject({
      parseErrors: [
        expect.objectContaining({
          filePath: join(dir, "tests", "broken.yaml"),
          error: expect.stringMatching(/unterminated|flow sequence/i),
        }),
      ],
    });
  });

  it("covers intentionally broken authoring fixtures outside public examples", async () => {
    const brokenAuthoringDir = join(integrationFixturesDir, "broken-authoring");

    const providerResponse = await new AgentSkillEvalsStaticProvider({
      config: { baseDir: brokenAuthoringDir },
    }).callApi("static-check", {
      vars: {
        skillPath: "./skills/broken-routing",
        testsGlob: "./tests/broken-routing.yaml",
      },
    });
    const result = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.checks" },
      providerResponse,
    });

    expect(providerResponse.error).toBeUndefined();
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/description is too generic/);
    expect(result.reason).toMatch(/missing references: \.\/scripts\/does-not-exist\.sh/);
    expect(result.reason).toMatch(/should_not\[0\]: .*must be declared under should/);
    expect(result.reason).toMatch(/unsupported effect types: made\.up\.effect/);
    expect(result.reason).toMatch(/missing referenced files:/);
    expect(result.reason).toMatch(/missing verifier scripts:/);
    expect(result.reason).toMatch(/missing fixtures:/);
  });

  it("covers invalid skill metadata outside public examples", async () => {
    const invalidMetadataDir = join(integrationFixturesDir, "invalid-skill-metadata");

    const providerResponse = await new AgentSkillEvalsStaticProvider({
      config: { baseDir: invalidMetadataDir },
    }).callApi("static-check", {
      vars: {
        skillPath: "./skills/missing-frontmatter",
        testsGlob: "./tests/valid.yaml",
      },
    });
    const result = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.checks" },
      providerResponse,
    });

    expect(providerResponse.error).toBeUndefined();
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/missing `name` frontmatter/);
    expect(result.reason).toMatch(/missing `description` frontmatter/);
    expect(result.reason).toMatch(/description does not say when to use/);
    expect(result.reason).toMatch(/description does not say when not to use/);
  });

  it("covers non-executable verifier fixtures outside public examples", async () => {
    const nonExecutableDir = join(integrationFixturesDir, "non-executable-verifier");

    const providerResponse = await new AgentSkillEvalsStaticProvider({
      config: { baseDir: nonExecutableDir },
    }).callApi("static-check", {
      vars: {
        skillPath: "./skills/verifier-skill",
        testsGlob: "./tests/non-executable-verifier.yaml",
      },
    });
    const result = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.checks" },
      providerResponse,
    });

    expect(providerResponse.error).toBeUndefined();
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/non-executable verifier scripts:/);
    expect(result.reason).toMatch(/verify\.sh/);
  });

  it("covers malformed runtime field shapes outside public examples", async () => {
    const malformedFieldsDir = join(integrationFixturesDir, "malformed-runtime-fields");

    const providerResponse = await new AgentSkillEvalsStaticProvider({
      config: { baseDir: malformedFieldsDir },
    }).callApi("static-check", {
      vars: {
        skillPath: "./skills/runtime-fields",
        testsGlob: "./tests/malformed.yaml",
      },
    });
    const result = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.checks" },
      providerResponse,
    });

    expect(providerResponse.error).toBeUndefined();
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/should: must be an array of assertion entries/);
    expect(result.reason).toMatch(/should_not\[0\]: entry must be a string, \{ type: \.\.\. \}, or shorthand object/);
    expect(result.reason).toMatch(/missing vars\.fixture \(or vars\.fixtureless: true\)/);
    expect(result.reason).toMatch(/no should \/ should_not/);
  });

  it("allows intentionally fixtureless static tests when declared explicitly", async () => {
    const fixturelessDir = join(integrationFixturesDir, "fixtureless");

    const providerResponse = await new AgentSkillEvalsStaticProvider({
      config: { baseDir: fixturelessDir },
    }).callApi("static-check", {
      vars: {
        skillPath: "./skills/fixtureless-check",
        testsGlob: "./tests/fixtureless.yaml",
      },
    });
    const result = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.checks" },
      providerResponse,
    });

    expect(providerResponse.error).toBeUndefined();
    expect(result.pass).toBe(true);
  });
});
