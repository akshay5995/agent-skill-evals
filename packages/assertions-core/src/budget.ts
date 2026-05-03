import {
  loadEvidence,
  loadMetadata,
  type GradingResult,
  type PromptfooAssertContext,
} from "./_shared.js";

interface BudgetSpec {
  max_runtime_seconds?: number;
  max_tool_calls?: number;
  max_cost_usd?: number;
  max_total_tokens?: number;
}

/**
 * `budget` assertion. Reads `vars.budget` and compares against provider
 * metadata + evidence. Soft by default — score reflects how much of the
 * budget was used; pass requires every limit honoured.
 */
export default async function budget(
  _output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const meta = await loadMetadata(context);
  if (!meta) {
    return {
      pass: true,
      score: 1,
      reason: "budget: provider metadata missing (skipped)",
    };
  }
  const vars = (context.vars ?? context.test?.vars ?? {}) as Record<string, unknown>;
  const spec = (vars.budget ?? {}) as BudgetSpec;
  const evidence = await loadEvidence(meta);

  const checks: Array<{ pass: boolean; score: number; reason: string }> = [];

  if (spec.max_runtime_seconds !== undefined) {
    const used = meta.durationMs / 1000;
    const limit = spec.max_runtime_seconds;
    checks.push({
      pass: used <= limit,
      score: Math.max(0, 1 - used / limit),
      reason: `runtime ${used.toFixed(1)}s / ${limit}s`,
    });
  }

  if (spec.max_tool_calls !== undefined) {
    const used = evidence.toolCalls().length;
    const limit = spec.max_tool_calls;
    checks.push({
      pass: used <= limit,
      score: Math.max(0, 1 - used / Math.max(limit, 1)),
      reason: `tool_calls ${used} / ${limit}`,
    });
  }

  if (spec.max_total_tokens !== undefined) {
    const used = evidence.usage().totalTokens ?? 0;
    const limit = spec.max_total_tokens;
    checks.push({
      pass: used <= limit,
      score: Math.max(0, 1 - used / Math.max(limit, 1)),
      reason: `total_tokens ${used} / ${limit}`,
    });
  }

  if (checks.length === 0) {
    return { pass: true, score: 1, reason: "budget: no limits declared" };
  }

  const allPass = checks.every((c) => c.pass);
  const avgScore = checks.reduce((s, c) => s + c.score, 0) / checks.length;
  return {
    pass: allPass,
    score: allPass ? avgScore : 0,
    reason: checks.map((c) => `${c.pass ? "✓" : "✗"} ${c.reason}`).join("; "),
    componentResults: checks,
  };
}
