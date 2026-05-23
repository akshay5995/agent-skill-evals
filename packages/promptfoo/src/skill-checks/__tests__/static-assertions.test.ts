import { describe, expect, it } from "vitest";
import { agentSkillEvalsStaticAssertions } from "../assertions-static/index.js";
import type { StaticProviderMetadata } from "../index.js";

function metadata(overrides: Partial<StaticProviderMetadata> = {}): StaticProviderMetadata {
  return {
    skill: {
      skillMdPath: "/repo/skills/bugfix/SKILL.md",
      skillDir: "/repo/skills/bugfix",
      frontmatter: {
        name: "bugfix",
        description: "Use when fixing bugs. Do not use for feature work.",
      },
      body: "# bugfix",
      totalLines: 6,
      references: [],
      missingReferences: [],
    },
    tests: {
      matchedFiles: ["/repo/tests/bugfix.yaml"],
      tests: [
        {
          filePath: "/repo/tests/bugfix.yaml",
          description: "fixes bug",
          vars: {
            prompt: "Fix the bug",
            fixture: "./fixtures/bug",
            should: [{ "verifier.succeeds": { run: "./missing.sh" } }],
          },
          effectTypes: ["verifier.succeeds"],
          hasFixture: true,
          isNegative: false,
          hasPrecondition: false,
          hasTokenBudget: false,
          isDraft: false,
          entryErrors: [],
        },
      ],
      parseErrors: [],
      verifierScripts: ["/repo/fixtures/bug/missing.sh"],
      missingVerifierScripts: ["/repo/fixtures/bug/missing.sh"],
      nonExecutableVerifierScripts: [],
      fixturePaths: ["/repo/fixtures/bug"],
      missingFixturePaths: [],
      unresolvedEffectTypes: [],
    },
    missingFiles: ["/repo/fixtures/bug/missing.sh"],
    unresolvedEffectTypes: [],
    warnings: [],
    ...overrides,
  };
}

describe("agentSkillEvalsStaticAssertions", () => {
  it("fails skill.tests when referenced files are missing and keeps verifier diagnostics routed", async () => {
    const meta = metadata();

    const testResult = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.tests" },
      providerResponse: { metadata: meta },
    });
    const verifierResult = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.verifiers" },
      providerResponse: { metadata: meta },
    });

    expect(testResult.pass).toBe(false);
    expect(testResult.reason).toMatch(/missing referenced files/);
    expect(verifierResult.pass).toBe(false);
    expect(verifierResult.reason).toMatch(/missing verifier scripts/);
  });

  it("uses Promptfoo assertion metric before broader context metrics", async () => {
    const result = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.verifiers" },
      metric: "skill.activation",
      providerResponse: { metadata: metadata() },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/missing verifier scripts/);
  });

  it("reports available metrics for unknown metric names", async () => {
    const result = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.unknown" },
      providerResponse: { metadata: metadata() },
    });

    expect(result).toMatchObject({
      pass: false,
      score: 0,
    });
    expect(result.reason).toMatch(/unknown metric "skill\.unknown"/);
    expect(result.reason).toMatch(/skill\.activation/);
    expect(result.reason).toMatch(/skill\.verifiers/);
  });

  it("falls back invalid agentSkillEvals settings per field", async () => {
    const base = metadata();
    const meta = metadata({
      tests: {
        ...base.tests!,
        tests: [
          {
            ...base.tests!.tests[0]!,
            effectTypes: ["custom.risky"],
          },
        ],
      },
    });

    const result = await agentSkillEvalsStaticAssertions("", {
      assertion: {
        metric: "skill.tests",
      },
      config: {
        agentSkillEvals: {
          maxSkillLines: "bad",
          riskyEffects: ["custom.risky"],
        },
      },
      providerResponse: { metadata: meta },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/custom\.risky/);
    expect(result.reason).toMatch(/no negative test/);
  });

  it("reports skill.context as a soft failure when the skill exceeds the line budget", async () => {
    const result = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.context" },
      config: {
        agentSkillEvals: {
          maxSkillLines: 5,
        },
      },
      providerResponse: {
        metadata: metadata({
          skill: {
            ...metadata().skill!,
            totalLines: 6,
          },
        }),
      },
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.5);
    expect(result.reason).toMatch(/SKILL\.md 6 line\(s\) \(limit 5\)/);
  });

  it("falls back invalid maxSkillLines to the default context limit", async () => {
    const result = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.context" },
      config: {
        agentSkillEvals: {
          maxSkillLines: "bad",
        },
      },
      providerResponse: {
        metadata: metadata({
          skill: {
            ...metadata().skill!,
            totalLines: 201,
          },
        }),
      },
    });

    expect(result.pass).toBe(true);
    expect(result.score).toBe(0.5);
    expect(result.reason).toMatch(/SKILL\.md 201 line\(s\) \(limit 200\)/);
  });

  it("fails skill.instructions for default destructive effects without safety language or should_not", async () => {
    const base = metadata();
    const result = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.instructions" },
      providerResponse: {
        metadata: metadata({
          tests: {
            ...base.tests!,
            tests: [
              {
                ...base.tests!.tests[0]!,
                vars: {
                  prompt: "Edit the file",
                  fixture: "./fixtures/bug",
                  should: [{ "tool.called": { tool: "Edit" } }],
                },
                effectTypes: ["tool.called"],
              },
            ],
          },
        }),
      },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/lacks confirmation \/ plan-before-act language/);
    expect(result.reason).toMatch(/no should_not declared/);
  });

  it("passes skill.instructions when destructive effects have safety language and forbidden checks", async () => {
    const base = metadata();
    const result = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.instructions" },
      providerResponse: {
        metadata: metadata({
          skill: {
            ...base.skill!,
            body: "# bugfix\n\nRead the code before write operations and plan before changing files.",
          },
          tests: {
            ...base.tests!,
            tests: [
              {
                ...base.tests!.tests[0]!,
                vars: {
                  prompt: "Edit the file",
                  fixture: "./fixtures/bug",
                  should: [{ "tool.called": { tool: "Edit" } }],
                  should_not: [{ "file.changes_outside_scope": { scope: ["app.js"] } }],
                },
                effectTypes: ["tool.called", "file.changes_outside_scope"],
              },
            ],
          },
        }),
      },
    });

    expect(result.pass).toBe(true);
    expect(result.componentResults).toEqual([
      expect.objectContaining({
        pass: true,
        reason: "skill.instructions: ok",
      }),
    ]);
  });

  it("can require real-agent tests to declare token budgets", async () => {
    const result = await agentSkillEvalsStaticAssertions("", {
      assertion: { metric: "skill.budgets" },
      config: {
        agentSkillEvals: {
          requireTokenBudget: true,
        },
      },
      providerResponse: { metadata: metadata() },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/missing skill\.budget assertion/);
  });
});
