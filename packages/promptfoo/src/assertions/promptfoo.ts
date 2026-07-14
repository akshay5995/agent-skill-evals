import skillTest from "./skill-test.js";
import skillBudget from "./skill-budget.js";
import type { GradingResult, PromptfooAssertContext } from "./_shared.js";

type AssertionFn = (
  output: string,
  context: PromptfooAssertContext,
) => Promise<GradingResult>;

const routes: Record<string, AssertionFn> = {
  "skill.budget": skillBudget,
  "skill.test": skillTest,
};
const knownMetrics = Object.keys(routes);
const availableMetrics = [...knownMetrics].sort().join(", ");

export { skillTest };

function sameConfig(a: unknown, b: unknown): boolean {
  if (a === undefined && b === undefined) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Promptfoo hands a javascript assertion its `config` but not its `metric`,
 * so a lone `metric:` declaration used to require a duplicate `config.metric`.
 * Recover the metric from the test's assert list instead: the entry whose
 * config matches the one Promptfoo passed is the assertion being graded.
 */
function metricFromTestAsserts(context: PromptfooAssertContext): string | undefined {
  const asserts = context.test?.assert;
  if (!Array.isArray(asserts)) return undefined;
  const candidates = asserts.filter(
    (entry): entry is { metric: string; config?: unknown } =>
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as { metric?: unknown }).metric === "string" &&
      knownMetrics.includes((entry as { metric: string }).metric),
  );
  if (candidates.length === 1) return candidates[0]!.metric;
  const matched = candidates.filter((entry) => sameConfig(entry.config, context.config));
  if (matched.length === 1) return matched[0]!.metric;
  return undefined;
}

function metricFrom(context: PromptfooAssertContext): string | undefined {
  return [
    context.assertion?.metric,
    context.assert?.metric,
    context.config?.metric,
    context.metric,
  ].find((metric): metric is string => typeof metric === "string") ?? metricFromTestAsserts(context);
}

export default async function agentSkillEvalsAssertions(
  output: string,
  context: PromptfooAssertContext,
): Promise<GradingResult> {
  const metric = metricFrom(context);
  const assertion = metric ? routes[metric] : undefined;
  if (assertion) {
    return assertion(output, context);
  }
  return {
    pass: false,
    score: 0,
    reason:
      `agent-skill-evals assertions: unknown metric "${metric ?? "missing"}". ` +
      `Available metrics: ${availableMetrics}. ` +
      "Declare the metric on the assertion (metric: skill.test). If one test case uses " +
      "several agent-skill-evals assertions with identical config blocks, disambiguate " +
      "with config.metric.",
  };
}
