import skillTest from "./skill-test.js";
import skillBudget from "./skill-budget.js";
import { agentSkillEvalsStaticAssertions } from "../skill-checks/assertions-static/promptfoo.js";
import type { GradingResult, PromptfooAssertContext } from "./_shared.js";

type AssertionFn = (
  output: string,
  context: PromptfooAssertContext,
) => Promise<GradingResult>;

const routes: Record<string, AssertionFn> = {
  "skill.budget": skillBudget,
  "skill.test": skillTest,
};
const staticMetrics = [
  "skill.checks",
  "skill.activation",
  "skill.budgets",
  "skill.context",
  "skill.instructions",
  "skill.tests",
  "skill.verifiers",
];
const availableMetrics = [...Object.keys(routes), ...staticMetrics].sort().join(", ");

export { skillTest };

function metricFrom(context: PromptfooAssertContext): string | undefined {
  const candidates = [
    context.assertion?.metric,
    context.assert?.metric,
    context.config?.metric,
    context.metric,
  ];
  return candidates.find((metric): metric is string => typeof metric === "string");
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
  if (metric && staticMetrics.includes(metric)) {
    return agentSkillEvalsStaticAssertions(output, context);
  }
  return {
    pass: false,
    score: 0,
    reason: `agent-skill-evals assertions: unknown metric "${metric ?? "missing"}". Available metrics: ${availableMetrics}`,
  };
}
