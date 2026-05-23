import { describe, expect, it } from "vitest";
import agentSkillEvalsAssertions from "../promptfoo.js";
import skillBudget from "../skill-budget.js";

describe("skill.budget", () => {
  it("passes when provider token usage is within configured limits", async () => {
    const result = await skillBudget("", {
      providerResponse: {
        tokenUsage: {
          total: 100,
          prompt: 70,
          completion: 30,
        },
      },
      config: {
        agentSkillEvals: {
          maxTotalTokens: 120,
          maxCompletionTokens: 40,
        },
      },
    });

    expect(result.pass).toBe(true);
    expect(result.reason).toMatch(/budget\(s\) passed/);
  });

  it("fails when token usage exceeds a configured limit", async () => {
    const result = await skillBudget("", {
      providerResponse: {
        tokenUsage: {
          total: 125,
          completion: 30,
        },
      },
      config: {
        agentSkillEvals: {
          maxTotalTokens: 120,
          maxCompletionTokens: 40,
        },
      },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toContain("total tokens 125 <= 120");
  });

  it("fails closed when token usage is missing", async () => {
    const result = await skillBudget("", {
      config: {
        agentSkillEvals: {
          maxTotalTokens: 120,
        },
      },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toBe("skill.budget: provider tokenUsage missing");
  });

  it("fails closed when a configured token field is missing", async () => {
    const result = await skillBudget("", {
      providerResponse: {
        tokenUsage: {
          completion: 20,
        },
      },
      config: {
        agentSkillEvals: {
          maxTotalTokens: 120,
        },
      },
    });

    expect(result.pass).toBe(false);
    expect(result.reason).toBe("total tokens missing");
  });

  it("is routed as a runtime assertion by the shared assertion entrypoint", async () => {
    const result = await agentSkillEvalsAssertions("", {
      assertion: { metric: "skill.budget" },
      providerResponse: {
        tokenUsage: {
          total: 10,
        },
      },
      config: {
        agentSkillEvals: {
          maxTotalTokens: 20,
        },
      },
    });

    expect(result.pass).toBe(true);
  });
});
