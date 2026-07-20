import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadTestPack,
  parseTestPackDocument,
  testPackGenerator,
  toPromptfooTests,
} from "../test-pack.js";

const cleanPack = {
  skill: "./skills/bugfix-workflow",
  supporting_skills: ["./skills/release-notes"],
  tests: [
    {
      description: "fixes the redirect",
      prompt: "Fix the redirect.",
      fixture: "./fixtures/login-bug",
      setup: ["pnpm install --offline"],
      preconditions: [{ "verifier.fails": { run: "./verify.sh" } }],
      expect: [
        { "verifier.succeeds": { run: "./verify.sh" } },
        { "file.changes_within": { paths: ["app.js"] } },
      ],
      budget: { max_total_tokens: 10_000 },
    },
    {
      description: "routes among meaningful alternatives",
      mode: "routing",
      prompt: "Fix the redirect.",
      distractor_skills: ["./skills/brand-deck"],
      expect: [{ "skill.loaded": { skills: ["bugfix-workflow"] } }],
    },
  ],
};

describe("clean Test Pack", () => {
  it("parses top-level domain fields and defaults cases to behavior mode", () => {
    const parsed = parseTestPackDocument(cleanPack);

    expect(parsed.skill).toBe("./skills/bugfix-workflow");
    expect(parsed.tests[0]?.mode).toBe("behavior");
    expect(parsed.tests[1]?.mode).toBe("routing");
  });

  it("rejects the legacy Promptfoo vars shape with a migration message", () => {
    expect(() =>
      parseTestPackDocument([
        { description: "legacy", vars: { prompt: "Do work", fixtureless: true } },
      ]),
    ).toThrow(/clean Test Pack format.*top-level `skill` and `tests`/i);
  });

  it("requires a distractor for routing when the built-in distractor is disabled", () => {
    expect(() =>
      parseTestPackDocument({
        skill: "./skills/demo",
        builtin_distractor: false,
        tests: [
          {
            mode: "routing",
            prompt: "Use demo",
            expect: [{ "skill.loaded": { skills: ["demo"] } }],
          },
        ],
      }),
    ).toThrow(/routing.*distractor/i);
  });

  it("rejects an empty scripted conversation", () => {
    expect(() =>
      parseTestPackDocument({
        skill: "./skills/demo",
        tests: [
          {
            prompt: "Use demo",
            conversation: { scripted_user: [] },
            expect: [{ "output.contains": { text: "done" } }],
          },
        ],
      }),
    ).toThrow(/scripted_user/i);
  });

  it("translates clean cases into native Promptfoo cases", () => {
    const parsed = parseTestPackDocument(cleanPack);
    const tests = toPromptfooTests(parsed, {
      assertionPath: "file://./agent-skill-evals/assertions.js",
    });

    expect(tests[0]).toMatchObject({
      description: "fixes the redirect",
      vars: {
        prompt: "Fix the redirect.",
        skillPath: "./skills/bugfix-workflow",
        mode: "behavior",
        fixture: "./fixtures/login-bug",
        expect: cleanPack.tests[0]!.expect,
      },
      assert: [
        {
          type: "javascript",
          metric: "skill.test",
          value: "file://./agent-skill-evals/assertions.js",
        },
        {
          type: "javascript",
          metric: "skill.budget",
          value: "file://./agent-skill-evals/assertions.js",
        },
      ],
    });
    expect(tests[1]?.vars).toMatchObject({
      mode: "routing",
      builtinDistractor: true,
      distractorSkills: ["./skills/brand-deck"],
    });
  });

  it("defaults skill delivery to native and lets a test override the pack", () => {
    const parsed = parseTestPackDocument(cleanPack);
    expect(parsed.skill_delivery).toBe("native");

    const mcpPack = parseTestPackDocument({
      ...cleanPack,
      skill_delivery: "mcp",
      tests: [
        cleanPack.tests[0],
        { ...cleanPack.tests[1], skill_delivery: "native" },
      ],
    });
    const tests = toPromptfooTests(mcpPack, { assertionPath: "file://assertions.js" });
    expect(tests[0]?.vars).toMatchObject({ skillDelivery: "mcp" });
    expect(tests[1]?.vars).toMatchObject({ skillDelivery: "native" });
  });

  it("reserves the \"skills\" Mock Service name under mcp delivery", () => {
    const reservedMock = { name: "skills", kind: "mcp", command: "node" };
    expect(() =>
      parseTestPackDocument({
        ...cleanPack,
        skill_delivery: "mcp",
        environment: { mocks: [reservedMock] },
      }),
    ).toThrow(/"skills" is reserved/);
    expect(() =>
      parseTestPackDocument({
        ...cleanPack,
        tests: [{ ...cleanPack.tests[0], skill_delivery: "mcp", environment: { mocks: [reservedMock] } }],
      }),
    ).toThrow(/"skills" is reserved/);
    // Native delivery keeps the name available.
    expect(() =>
      parseTestPackDocument({
        ...cleanPack,
        environment: { mocks: [reservedMock] },
      }),
    ).not.toThrow();
  });

  it("loads YAML through the same parser used by the Promptfoo generator", async () => {
    const root = mkdtempSync(join(tmpdir(), "agent-skill-evals-pack-"));
    mkdirSync(join(root, "tests"), { recursive: true });
    writeFileSync(
      join(root, "tests", "demo.yaml"),
      [
        "skill: ./skills/demo",
        "tests:",
        "  - prompt: Do the work",
        "    expect:",
        "      - output.contains: { text: done }",
      ].join("\n"),
    );

    const loaded = await loadTestPack(join(root, "tests", "demo.yaml"));
    const generated = await testPackGenerator({
      path: join(root, "tests", "demo.yaml"),
      assertionPath: "file://assertions.js",
    });

    expect(loaded.tests[0]?.prompt).toBe("Do the work");
    expect(generated[0]?.vars).toMatchObject({ prompt: "Do the work" });
  });
});
