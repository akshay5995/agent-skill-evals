import { describe, it, expect } from "vitest";
import routingMetadata from "../routing-metadata.js";
import scenarioValidity from "../scenario-validity.js";
import negativeCoverage from "../negative-coverage.js";
import mcpEvidence from "../mcp-evidence.js";
import contextEconomy from "../context-economy.js";
import instructionCalibration from "../instruction-calibration.js";
import executableHelper from "../executable-helper.js";
import type { StaticProviderMetadata } from "@skillkit/promptfoo-provider-static";
import type { ParsedSkill, ParsedTestsPack } from "@skillkit/promptfoo-provider-static";

function skill(over: Partial<ParsedSkill> = {}): ParsedSkill {
  return {
    skillMdPath: "/x/SKILL.md",
    skillDir: "/x",
    frontmatter: { name: "x", description: "Use when X. Do not use for Y." },
    body: "ask first; confirm before push to main",
    totalLines: 50,
    references: [],
    missingReferences: [],
    ...over,
  };
}

function tests(over: Partial<ParsedTestsPack> = {}): ParsedTestsPack {
  return {
    tests: [],
    parseErrors: [],
    verifierScripts: [],
    missingVerifierScripts: [],
    fixturePaths: [],
    missingFixturePaths: [],
    unresolvedEffectTypes: [],
    ...over,
  };
}

function meta(over: Partial<StaticProviderMetadata>): StaticProviderMetadata {
  return {
    skill: null,
    tests: null,
    missingFiles: [],
    unresolvedEffectTypes: [],
    warnings: [],
    ...over,
  };
}

describe("routing-metadata", () => {
  it("passes well-formed skill", async () => {
    const r = await routingMetadata("", { providerResponse: { metadata: meta({ skill: skill() }) } });
    expect(r.pass).toBe(true);
  });

  it("fails when description is missing", async () => {
    const r = await routingMetadata("", {
      providerResponse: {
        metadata: meta({ skill: skill({ frontmatter: { name: "x", description: "" } }) }),
      },
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/description/);
  });

  it("fails when description is generic", async () => {
    const r = await routingMetadata("", {
      providerResponse: {
        metadata: meta({ skill: skill({ frontmatter: { name: "x", description: "Helps with GitHub workflows." } }) }),
      },
    });
    expect(r.pass).toBe(false);
  });

  it("fails when description omits 'do not use'", async () => {
    const r = await routingMetadata("", {
      providerResponse: {
        metadata: meta({ skill: skill({ frontmatter: { name: "x", description: "Use when fixing bugs." } }) }),
      },
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/when not to use/);
  });
});

describe("scenario-validity", () => {
  const goodTest = {
    filePath: "/x/t.yaml",
    description: "ok",
    vars: { prompt: "do", fixture: "./f", should: ["secret.read"] },
    effectTypes: ["secret.read"],
    hasFixture: true,
    isNegative: false,
    usesMcpAssertions: false,
    hasPrecondition: false,
    isDraft: false,
  };

  it("passes well-formed tests", async () => {
    const r = await scenarioValidity("", {
      providerResponse: { metadata: meta({ tests: tests({ tests: [goodTest] }) }) },
    });
    expect(r.pass).toBe(true);
  });

  it("fails when prompt missing", async () => {
    const bad = { ...goodTest, vars: { ...goodTest.vars, prompt: "" } };
    const r = await scenarioValidity("", {
      providerResponse: { metadata: meta({ tests: tests({ tests: [bad] }) }) },
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/prompt/);
  });

  it("fails on unsupported effect types", async () => {
    const r = await scenarioValidity("", {
      providerResponse: {
        metadata: meta({
          tests: tests({ tests: [goodTest] }),
          unresolvedEffectTypes: ["made.up"],
        }),
      },
    });
    expect(r.pass).toBe(false);
  });
});

describe("negative-coverage", () => {
  it("passes when no risky effect used", async () => {
    const r = await negativeCoverage("", {
      providerResponse: {
        metadata: meta({
          tests: tests({
            tests: [{
              filePath: "x", vars: {}, effectTypes: ["file.exists"],
              hasFixture: true, isNegative: false, usesMcpAssertions: false,
              hasPrecondition: false, isDraft: false,
            }],
          }),
        }),
      },
    });
    expect(r.pass).toBe(true);
  });

  it("fails when risky effect present but no negative test", async () => {
    const r = await negativeCoverage("", {
      providerResponse: {
        metadata: meta({
          tests: tests({
            tests: [{
              filePath: "x", vars: {}, effectTypes: ["git.push_to_branch"],
              hasFixture: true, isNegative: false, usesMcpAssertions: false,
              hasPrecondition: false, isDraft: false,
            }],
          }),
        }),
      },
    });
    expect(r.pass).toBe(false);
  });
});

describe("mcp-evidence", () => {
  it("passes when no mcp assertions", async () => {
    const r = await mcpEvidence("", {
      providerResponse: { metadata: meta({ tests: tests() }) },
    });
    expect(r.pass).toBe(true);
  });

  it("fails when mcp used without evidence sources", async () => {
    const r = await mcpEvidence("", {
      providerResponse: {
        metadata: meta({
          tests: tests({
            tests: [{
              filePath: "x", vars: {}, effectTypes: ["mcp.tool_called"],
              hasFixture: true, isNegative: false, usesMcpAssertions: true,
              hasPrecondition: false, isDraft: false,
            }],
          }),
        }),
      },
      vars: { evidenceSources: [] },
    });
    expect(r.pass).toBe(false);
  });

  it("passes when mcp-recorder is declared", async () => {
    const r = await mcpEvidence("", {
      providerResponse: {
        metadata: meta({
          tests: tests({
            tests: [{
              filePath: "x", vars: {}, effectTypes: ["mcp.tool_called"],
              hasFixture: true, isNegative: false, usesMcpAssertions: true,
              hasPrecondition: false, isDraft: false,
            }],
          }),
        }),
      },
      vars: { evidenceSources: ["mcp-recorder"] },
    });
    expect(r.pass).toBe(true);
  });
});

describe("context-economy", () => {
  it("passes within size limit", async () => {
    const r = await contextEconomy("", {
      providerResponse: { metadata: meta({ skill: skill({ totalLines: 100 }) }) },
    });
    expect(r.pass).toBe(true);
  });

  it("hard-fails on missing references", async () => {
    const r = await contextEconomy("", {
      providerResponse: { metadata: meta({ skill: skill({ missingReferences: ["./missing.sh"] }) }) },
    });
    expect(r.pass).toBe(false);
  });
});

describe("instruction-calibration", () => {
  it("passes when no destructive effects", async () => {
    const r = await instructionCalibration("", {
      providerResponse: { metadata: meta({ skill: skill(), tests: tests() }) },
    });
    expect(r.pass).toBe(true);
  });

  it("fails when destructive effects but no confirm language", async () => {
    const r = await instructionCalibration("", {
      providerResponse: {
        metadata: meta({
          skill: skill({ body: "do the thing fast" }),
          tests: tests({
            tests: [{
              filePath: "x", vars: {}, effectTypes: ["git.push_to_branch"],
              hasFixture: true, isNegative: true, usesMcpAssertions: false,
              hasPrecondition: false, isDraft: false,
            }],
          }),
        }),
      },
    });
    expect(r.pass).toBe(false);
  });
});

describe("executable-helper", () => {
  it("passes when scripts and fixtures present", async () => {
    const r = await executableHelper("", {
      providerResponse: { metadata: meta({ tests: tests({ verifierScripts: ["a.sh"], fixturePaths: ["/f"] }) }) },
    });
    expect(r.pass).toBe(true);
  });

  it("fails on missing verifier script", async () => {
    const r = await executableHelper("", {
      providerResponse: { metadata: meta({ tests: tests({ missingVerifierScripts: ["a.sh"] }) }) },
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/missing verifier/);
  });
});
