import { describe, expect, it } from "vitest";
import agentSkillEvalsAssertions from "../promptfoo.js";

describe("agentSkillEvalsAssertions metric resolution", () => {
  it("uses config.metric when present", async () => {
    const result = await agentSkillEvalsAssertions("", {
      config: { metric: "skill.test" },
    });
    // skill.test without provider metadata fails, but it was dispatched.
    expect(result.reason).not.toMatch(/unknown metric/);
  });

  it("recovers the metric from a single agent-skill-evals assert entry", async () => {
    const result = await agentSkillEvalsAssertions("", {
      test: {
        assert: [
          { type: "javascript", metric: "skill.test", value: "file://assertions.js" },
        ],
      },
    });
    expect(result.reason).not.toMatch(/unknown metric/);
  });

  it("matches this assertion by config among several entries", async () => {
    const result = await agentSkillEvalsAssertions("", {
      config: { agentSkillEvals: { maxTotalTokens: 5 } },
      test: {
        assert: [
          { type: "javascript", metric: "skill.test", value: "file://assertions.js" },
          {
            type: "javascript",
            metric: "skill.budget",
            value: "file://assertions.js",
            config: { agentSkillEvals: { maxTotalTokens: 5 } },
          },
        ],
      },
    });
    // skill.budget fails closed without usage, proving it dispatched there.
    expect(result.reason).toMatch(/usage|budget/i);
    expect(result.reason).not.toMatch(/unknown metric/);
  });

  it("resolves the configless assertion when the other entry has config", async () => {
    const result = await agentSkillEvalsAssertions("", {
      test: {
        assert: [
          { type: "javascript", metric: "skill.test", value: "file://assertions.js" },
          {
            type: "javascript",
            metric: "skill.budget",
            value: "file://assertions.js",
            config: { agentSkillEvals: { maxTotalTokens: 5 } },
          },
        ],
      },
    });
    expect(result.reason).not.toMatch(/unknown metric/);
    expect(result.reason).not.toMatch(/budget/i);
  });

  it("asks for config.metric when entries are indistinguishable", async () => {
    const result = await agentSkillEvalsAssertions("", {
      test: {
        assert: [
          { type: "javascript", metric: "skill.test", value: "file://assertions.js" },
          { type: "javascript", metric: "skill.budget", value: "file://assertions.js" },
        ],
      },
    });
    expect(result.pass).toBe(false);
    expect(result.reason).toMatch(/config\.metric/);
  });

  it("ignores foreign metrics in the assert list", async () => {
    const result = await agentSkillEvalsAssertions("", {
      test: {
        assert: [
          { type: "llm-rubric", metric: "politeness", value: "be nice" },
          { type: "javascript", metric: "skill.test", value: "file://assertions.js" },
        ],
      },
    });
    expect(result.reason).not.toMatch(/unknown metric/);
  });
});
