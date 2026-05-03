/**
 * Promptfoo `assertScoringFunction`. Receives the per-assertion grading
 * results for a test case and returns the aggregate score + pass.
 *
 * SkillKit semantics (SPEC §15.1):
 *  - Any precondition / should / should_not failure => hard fail (score 0).
 *  - budget failures are configurable: by default they fail, but the metric
 *    name "budget" is treated as a soft gate when env SKILLKIT_BUDGET_SOFT=1.
 */

interface ScoringInput {
  results: Array<{
    pass: boolean;
    score: number;
    reason?: string;
    assertion?: { metric?: string };
    metric?: string;
    namedScores?: Record<string, number>;
  }>;
}

interface ScoringResult {
  pass: boolean;
  score: number;
  reason: string;
}

const HARD_GATE_METRICS = new Set([
  "preconditions",
  "outcome",
  "forbidden_effects",
  "should",
  "should_not",
]);

function metricOf(r: ScoringInput["results"][number]): string | undefined {
  return r.assertion?.metric ?? r.metric;
}

export default function hardGates(input: ScoringInput): ScoringResult {
  const failed = input.results.filter((r) => !r.pass);
  const hardFail = failed.find((r) => {
    const m = metricOf(r);
    return m !== undefined && HARD_GATE_METRICS.has(m);
  });
  if (hardFail) {
    return {
      pass: false,
      score: 0,
      reason: `hard-gate failure (${metricOf(hardFail) ?? "?"}): ${hardFail.reason ?? ""}`,
    };
  }

  const budgetSoft = process.env.SKILLKIT_BUDGET_SOFT === "1";
  const budgetFail = failed.find((r) => metricOf(r) === "budget");
  if (budgetFail && !budgetSoft) {
    return {
      pass: false,
      score: 0,
      reason: `budget failure: ${budgetFail.reason ?? ""}`,
    };
  }

  const total = input.results.length;
  const passed = total - failed.length;
  const score = total === 0 ? 1 : passed / total;
  return {
    pass: failed.length === 0 || (failed.length === 1 && budgetSoft && metricOf(failed[0]!) === "budget"),
    score,
    reason: failed.length === 0
      ? `all ${total} assertion(s) passed`
      : `${passed}/${total} passed; soft failures: ${failed.map((f) => metricOf(f) ?? "?").join(", ")}`,
  };
}
