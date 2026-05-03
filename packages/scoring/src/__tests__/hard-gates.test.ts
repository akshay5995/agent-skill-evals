import { describe, it, expect, afterEach } from "vitest";
import hardGates from "../hard-gates.js";

afterEach(() => {
  delete process.env.SKILLKIT_BUDGET_SOFT;
});

describe("hardGates scoring", () => {
  it("passes when all assertions pass", () => {
    const r = hardGates({
      results: [
        { pass: true, score: 1, assertion: { metric: "preconditions" } },
        { pass: true, score: 1, assertion: { metric: "outcome" } },
      ],
    });
    expect(r.pass).toBe(true);
    expect(r.score).toBe(1);
  });

  it("hard fails on precondition failure", () => {
    const r = hardGates({
      results: [
        { pass: false, score: 0, reason: "scenario invalid", assertion: { metric: "preconditions" } },
        { pass: true, score: 1, assertion: { metric: "outcome" } },
      ],
    });
    expect(r.pass).toBe(false);
    expect(r.score).toBe(0);
    expect(r.reason).toMatch(/preconditions/);
  });

  it("hard fails on forbidden_effects failure", () => {
    const r = hardGates({
      results: [
        { pass: true, score: 1, assertion: { metric: "outcome" } },
        { pass: false, score: 0, reason: "push to main observed", assertion: { metric: "forbidden_effects" } },
      ],
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/forbidden_effects/);
  });

  it("hard fails on should failure", () => {
    const r = hardGates({
      results: [{ pass: false, score: 0, reason: "x", assertion: { metric: "should" } }],
    });
    expect(r.pass).toBe(false);
  });

  it("budget failure is hard by default", () => {
    const r = hardGates({
      results: [{ pass: false, score: 0, reason: "over time", assertion: { metric: "budget" } }],
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toMatch(/budget/);
  });

  it("budget failure is soft under SKILLKIT_BUDGET_SOFT=1", () => {
    process.env.SKILLKIT_BUDGET_SOFT = "1";
    const r = hardGates({
      results: [
        { pass: true, score: 1, assertion: { metric: "outcome" } },
        { pass: false, score: 0, assertion: { metric: "budget" } },
      ],
    });
    expect(r.pass).toBe(true);
    expect(r.score).toBeCloseTo(0.5, 5);
  });

  it("supports flat metric field on result", () => {
    const r = hardGates({
      results: [{ pass: false, score: 0, metric: "preconditions", reason: "x" }],
    });
    expect(r.pass).toBe(false);
  });
});
