import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../..",
);
const validatorPath = path.join(
  repoRoot,
  "skills/agent-eval-skills/scripts/validate-agent-skill-evals-setup.mjs",
);

describe("agent-eval-skills setup validator", () => {
  it("accepts a valid runtime test pack", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-eval-validator-"));
    writeProject(root, validTestsYaml);

    const result = runValidator(root);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Agent Skill Evals setup is valid for release-notes");
  });

  it("validates verifier checks inside each runtime test case", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-eval-validator-"));
    writeProject(root, malformedTestsYaml);

    const result = runValidator(root);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("missing verifier case");
    expect(result.stderr).toContain("declare verifier.fails");
    expect(result.stderr).toContain("declare verifier.succeeds");
  });
});

function runValidator(root: string) {
  return spawnSync(process.execPath, [
    validatorPath,
    "--root",
    root,
    "--skill",
    "release-notes",
    "--output",
    "CHANGELOG.md",
  ], { encoding: "utf8" });
}

function writeProject(root: string, testsYaml: string) {
  fs.mkdirSync(path.join(root, "agent-skill-evals"), { recursive: true });
  fs.mkdirSync(path.join(root, "skills/release-notes"), { recursive: true });
  fs.mkdirSync(path.join(root, "tests"), { recursive: true });
  fs.mkdirSync(path.join(root, "fixtures/release-notes"), { recursive: true });

  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      devDependencies: {
        "agent-skill-evals": "^0.1.0",
        promptfoo: "^0.121.0",
      },
    }),
  );
  fs.writeFileSync(
    path.join(root, "agent-skill-evals/agent.js"),
    'export { default } from "agent-skill-evals/agent";\n',
  );
  fs.writeFileSync(
    path.join(root, "agent-skill-evals/skill-checks.js"),
    'export { default } from "agent-skill-evals/skill-checks";\n',
  );
  fs.writeFileSync(
    path.join(root, "agent-skill-evals/assertions.js"),
    [
      'export { default } from "agent-skill-evals/assertions";',
      'export * from "agent-skill-evals/assertions";',
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "skills/release-notes/SKILL.md"),
    "---\nname: release-notes\n---\n# release-notes\n",
  );
  fs.writeFileSync(
    path.join(root, "promptfoo.skill-checks.yaml"),
    [
      "prompts:",
      '  - "{{prompt}}"',
      "providers:",
      "  - id: file://./agent-skill-evals/skill-checks.js",
      "tests:",
      "  - vars:",
      "      skillPath: ./skills/release-notes",
      "      testsGlob: ./tests/release-notes.yaml",
      "    assert:",
      "      - type: javascript",
      "        metric: skill.checks",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(
    path.join(root, "promptfoo.codex.yaml"),
    [
      "prompts:",
      '  - "{{prompt}}"',
      "providers:",
      "  - id: file://./agent-skill-evals/agent.js",
      "    config:",
      "      adapter: codex-json",
      "      command: codex",
      "      args:",
      "        - --ask-for-approval",
      "        - never",
      "        - --sandbox",
      "        - workspace-write",
      "        - exec",
      "        - --json",
      '        - "-"',
      "tests:",
      "  - file://tests/release-notes.yaml",
      "",
    ].join("\n"),
  );
  fs.writeFileSync(path.join(root, "tests/release-notes.yaml"), testsYaml);
  const verifierPath = path.join(root, "fixtures/release-notes/verify_release_notes.cjs");
  fs.writeFileSync(
    verifierPath,
    [
      "#!/usr/bin/env node",
      'console.log("checks CHANGELOG.md");',
      "",
    ].join("\n"),
  );
  fs.chmodSync(verifierPath, 0o755);
}

const skillTestAssertion = [
  "  assert:",
  "    - type: javascript",
  "      metric: skill.test",
  "      value: file://./agent-skill-evals/assertions.js",
  "      config:",
  "        metric: skill.test",
].join("\n");

const validCasePrefix = [
  "  vars:",
  "    skill: release-notes",
  "    kind: {{kind}}",
  "    fixture: ./fixtures/release-notes",
  "    preconditions:",
  "      - verifier.fails:",
  "          run: ./verify_release_notes.cjs",
  "    should:",
  "      - verifier.succeeds:",
  "          run: ./verify_release_notes.cjs",
  "      - file.created:",
  "          path: CHANGELOG.md",
  "    should_not:",
  "      - file.changes_outside_scope:",
  "          scope:",
  "            - CHANGELOG.md",
].join("\n");

const validTestsYaml = [
  "- description: valid positive case",
  validCasePrefix.replace("{{kind}}", "positive"),
  skillTestAssertion,
  "",
  "- description: valid negative case",
  validCasePrefix.replace("{{kind}}", "negative"),
  skillTestAssertion,
  "",
].join("\n");

const malformedTestsYaml = [
  "- description: missing verifier case",
  "  vars:",
  "    skill: release-notes",
  "    kind: positive",
  "    fixture: ./fixtures/release-notes",
  "    preconditions:",
  "      - file.exists:",
  "          path: changes.json",
  "    should:",
  "      - file.created:",
  "          path: CHANGELOG.md",
  "    should_not:",
  "      - file.changes_outside_scope:",
  "          scope:",
  "            - CHANGELOG.md",
  skillTestAssertion,
  "",
  "- description: valid later case",
  "  vars:",
  "    skill: release-notes",
  "    kind: negative",
  "    fixture: ./fixtures/release-notes",
  "    preconditions:",
  "      - verifier.fails:",
  "          run: ./verify_release_notes.cjs",
  "    should:",
  "      - verifier.succeeds:",
  "          run: ./verify_release_notes.cjs",
  "    should_not:",
  "      - file.changes_outside_scope:",
  "          scope:",
  "            - CHANGELOG.md",
  skillTestAssertion,
  "",
].join("\n");
